// ************************ //
//                          //
//          UTILS           //
//                          //
// ************************ //

class BasicSlider {
  constructor(options){
    options = options || {};
    this.minpos = options.minpos || 0;
    this.maxpos = options.maxpos || 100;
    this.minval = options.minval || 0;
    this.maxval = options.maxval || 100;
    this.scale = (this.maxval - this.minval) / (this.maxpos - this.minpos);
  }

  get_value(pos){
    return (pos - this.minpos) * this.scale + this.minval;
  }

  get_position(val){
    return this.minpos + (val - this.minval) / this.scale;
  }
}

// https://codepen.io/willat600series/pen/ojzYJx
class LogSlider {
  constructor(options){
    options = options || {};
    this.minpos = options.minpos || 0;
    this.maxpos = options.maxpos || 100;
    this.minval = options.minval || 0;
    this.maxval = options.maxval || 100;
    this.minlval = Math.log(this.minval || 1);
    this.maxlval = Math.log(this.maxval || 100);
    this.scale = (this.maxlval - this.minlval) / (this.maxpos - this.minpos);
  }

  get_value(pos){
    return Math.exp((pos - this.minpos) * this.scale + this.minlval);
  }

  get_position(val){
    return this.minpos + (Math.log(val) - this.minlval) / this.scale;
  }
}

function isNumber(value) {
  if ((value === undefined) || (value === null)) {
      return false;
  }
  if (typeof value == 'number') {
      return true;
  }
  return !isNaN(value - 0);
}

function roundNumber(num, scale) {
  if(!("" + num).includes("e")) {
    return +(Math.round(num + "e+" + scale)  + "e-" + scale);
  } else {
    var arr = ("" + num).split("e");
    var sig = ""
    if(+arr[1] + scale > 0) {
      sig = "+";
    }
    return +(Math.round(+arr[0] + "e" + sig + (+arr[1] + scale)) + "e-" + scale);
  }
}

// ********************** //
//                        //
//         Timer          //
//                        //
// ********************** //

function ms2time_stamp(ms){
  ms = Math.max(0,ms);
  let seconds = parseInt(ms/1000);
  const hh = parseInt(seconds/3600);
  seconds = seconds%3600;
  const mm = parseInt(seconds/60);
  const ss = parseInt(seconds%60);
  const dd = [hh,mm,ss].map((a)=>(a < 10 ? '0' + a : a));
  return dd.join(':')
}
 
class Timer {
  constructor(target_seconds){
    this.end_time = new Date(target_seconds*1000);
    globLog.log('Timer',"Set timer to",target_seconds,"seconds. End time:",this.end_time.toTimeString());
    
  }

  step(){
    let remaining_time = this.end_time - new Date().getTime();
    const subheader = document.getElementById("text_page_subheader");
    subheader.innerHTML = "Remaining Time: "+ms2time_stamp(remaining_time);
    if (remaining_time < 180000) {
      subheader.style.color = 'red';
    }
    globLog.log('Timer',"Remaining time:",remaining_time+'ms');
    if (remaining_time < 0){
      globLog.log('Timer',"Time has run out.");
      globSettings.close_tool();
      return;
    }

    setTimeout(()=>this.step(),1000);
  }
}

// ********************** //
//                        //
//       Playspeed        //
//                        //
// ********************** //

class PlaySpeed {
  #_play_speed;

  constructor(play_speed=1,min_play_speed=0.05,max_play_speed=30.0){
    // Frames per second for the playback
    this.#_play_speed = play_speed;

    // Minimum/Maximum speed factor for playback
    this.min_play_speed = min_play_speed;
    this.max_play_speed = max_play_speed;
    this.playspeed_slider = new LogSlider({minval: this.min_play_speed, maxval: this.max_play_speed,  minpos: 0, maxpos: 100});
  
    // Gradually adjust speed
    this.move = null;
  }

  // Returns the current position (in %) of the playspeed slider
  get position(){return this.get_playspeed_pos(this.value);}

  // Returns the current playback fps
  get value(){return this.#_play_speed;}
  
  get_playspeed_pos(val){return this.playspeed_slider.get_position(val);}
  get_playspeed_val(pos){return this.playspeed_slider.get_value(pos);}

  set position(pos){
    this.set_playspeed_manual( this.get_playspeed_val(pos) );
  }
  set value(val){
    this.#_play_speed = Math.max(this.min_play_speed,Math.min(parseFloat(val),this.max_play_speed)).toFixed(2);
    globLog.log('Speed',"Set speed to",this.value);
    document.getElementById("slider_playspeed").value = this.position;
    document.getElementById("input_playspeed").value = this.value;
  }

  set_playspeed_manual(val){
    globLog.log('Speed',"Manually setting playspeed to",val);
    this.value = val;
    if(this.move !== null) this.cancel_move();
    POST_setting('play_speed',this.value);
  }

  slow_around(pred_sample,start_sample,target_sample,target_speed,constant_samples){
    if (this.move !== null){
      globLog.log('Speed',"Can't slow around sample",pred_sample,"since last move still active.");
      return;
    }

    this.move = {
      'pred_sample'     : pred_sample,
      'start_sample'    : start_sample,
      'target_sample'   : target_sample,
      'range_sample'    : target_sample - start_sample,

      'start_speed'     : this.value,
      'target_speed'    : target_speed,
      'range_speed'     : this.value - target_speed,

      'phase'           : 'decelerate',
      'constant_samples': constant_samples,
    }
    refreshButtons();
    globLog.log('Speed',"Slow around",this.move);
    setTimeout(()=>this.move_step(),globSettings.delay);
  }

  cancel_move(del_pred=false){
    if (this.move === null){globLog.log('Speed',"No move to be cancelled");return;}
    this.value = this.move['start_speed'];
    if (del_pred){
      globPred.del(this.move['pred_sample']);
    }
    this.move = null;
    refreshButtons();
    globLog.log('Speed',"Move cancelled");
  }

  async move_step(){
    if (this.move === null){return;}

    // cancel if playback stops
    if (!globSettings.isPlaying){
      this.cancel_move();
      return;
    }
    
    if (this.move['phase'] == 'decelerate'){
      if (globSettings.sample >= this.move['target_sample']){
        this.value = this.move['target_speed'];
        this.move['target_sample'] = this.move['target_sample'] + this.move['constant_samples'];
        this.move['phase'] = 'steady';
        globLog.log('Speed',"Finished deceleration. New Move:",this.move);
      }
      else{
        let progress = (this.move['target_sample'] - globSettings.sample) / this.move['range_sample']
        globLog.log('Speed',"Deceleration Progress:",1-progress);
        this.value = this.move['target_speed'] + this.move['range_speed'] * progress;
      }
    }

    else if (this.move['phase'] == 'steady'){
      if (globSettings.sample >= this.move['target_sample']){
        this.move['target_sample'] = this.move['target_sample'] + this.move['range_sample'];
        this.move['phase'] = 'accelerate';
        globLog.log('Speed',"Finished steady speed. New Move:",this.move);
      }
      else {
        let progress = (this.move['target_sample'] - globSettings.sample) / this.move['constant_samples']
        globLog.log('Speed',"Steady Progress:",1-progress);
      }
    }

    else if (this.move['phase'] == 'accelerate'){
      if (globSettings.sample >= this.move['target_sample']){
        this.value = this.move['start_speed'];
        this.move = null;
        globLog.log('Speed',"Finished acceleration. Move stopped.");
        return;
      }
      else{
        let progress = (this.move['target_sample'] - globSettings.sample) / this.move['range_sample']
        globLog.log('Speed',"Acceleration Progress:",1-progress);
        this.value = this.move['start_speed'] - this.move['range_speed'] * progress;
      }
    }

    else {
      globLog.log("Error","Unknown move phase:",this.move['phase'],this.move);
      this.move = null;
      return;
    }

    
    setTimeout(()=>this.move_step(),globSettings.delay);
  }
}

// ************************ //
//                          //
//       Signal Data        //
//                          //
// ************************ //

class Buffer {
  buffer_size;
  offset;
  max_sample;
  #_start = null;
  #data = null;

  #_locked = false;
  get locked(){return this.#_locked;} 

  constructor(buffer_size, max_sample){
    this.buffer_size = Math.round(buffer_size);
    this.max_sample = max_sample;
    globLog.log('Buffer',"Initiate signal data buffer with size",this.buffer_size,"and sample no",this.max_sample);
  }

  async setStart(sample){
    if (sample === null){
      globLog.log('Error',"Can't set sample to",sample);
      return false;
    }

    let start = Math.max(0,Math.round(sample - this.buffer_size * 0.25));
    let stop = Math.max(0,Math.round(sample + this.buffer_size * 0.75));
    while (this.locked){
      globLog.log('Buffer',"Locked: Can't set start",start)
      await new Promise(r => setTimeout(r, 100)); 
    }
    this.#_locked = true;
    let new_data = await GET_SignalData(start, stop, this.max_sample);
    this.#data = new_data;
    this.#_start = start;
    this.#_locked = false;
    globLog.log('Buffer',"Set buffer start to",this.start)
    return true;
  }

  async get_data(start_, stop_){
    const L = stop_ - start_;
    var start = start_;
    var stop = stop_;

    let off_l = 0;
    if (start < 0){
      off_l = -start;
      start = 0;
    }

    let off_r = 0;
    if (stop > this.max_sample){
      off_r = stop - this.max_sample;
      stop = this.max_sample;
    }

    globLog.log('Buffer',"Get data: offset L =",off_l,"start =",start,"stop=",stop,"offset R =",off_r,"request:",start_,"-",stop_);

    if (start === null || start<this.start || stop>this.stop){
      globLog.log('Buffer',"Not in Buffer:",start,"-",stop,"(",this.start,"-",this.stop,")");
      await this.setStart(start);
      globLog.log('Buffer',"New Buffer range:",this.start,"-",this.stop);
    }

    if (start>=this.start && stop<=this.stop){
      let idx_0 = start - this.start;
      let idx_1 = idx_0 + (stop - start);
      var dict = new Object();
      for (const [key, value] of Object.entries(this.#data)) {
        
        let idx = -1;
        let a = new Array(L); 
        //globLog.log('Buffer',"array before:",a);
        for (let i=0; i<off_l; ++i) a[++idx] = 0.5;
        for (let i=idx_0; i<idx_1; ++i) a[++idx] = value[i];
        for (let i=0; i<off_r; ++i) a[++idx] = 0.5;
        //globLog.log('Buffer',"array  after:",a);
        dict[key] = a;

        //dict[key] = value.slice(idx_0,idx_1);
        //console.log(key, value);
        //console.log(dict[key]);
      }
      if (!this.locked && (
        (start > (this.start+this.buffer_size*0.7)) || (start < (this.start+this.buffer_size*0.3))
        )){this.setStart(start);}
      return dict;
    }
    else {
      globLog.log('Error',"Can't provide:",start,"-",stop,"(",this.start,"-",this.stop,")");
      return null;
    }
  }

  get start(){return this.#_start;}
  get stop(){return this.start + this.size;}

  get size(){
    if (this.#data == null){
      return 0;
    }
    else{
      return Object.values(this.#data)[0].length;
    }
  }
}

// ************************ //
//                          //
//       Predictions        //
//                          //
// ************************ //

class Predictions {
  predictionMap;

  constructor(predictionObj=null){
    this.predictionMap = SortedArrayMap();

    if (predictionObj !== null){
      for (const [sample, label] of Object.entries(predictionObj)){
        this.predictionMap.set(parseInt(sample), label);
      }
    }

  }

  get length(){
    return this.predictionMap.length;
  }

  // Returns the first prediction within a given range
  getFirstInRange(start,stop){
    for (const [sample, label] of this.predictionMap.entries()){
      if(sample<=start){continue;}
      if(sample>stop){break;}
      return [sample, label];
    }
    return [null, null];
  }

  // Returns every prediction within a given range
  getRange(start,stop){
    var map = SortedArrayMap();
    for (const [sample, label] of this.predictionMap.entries()){
      if(sample<=start){continue;}
      if(sample>=stop){break;}
      map.set(sample,label);
    }
    return map;
  }


  // Returns the prediction at the given point or null if none is set
  getPred(sample){
    if (this.predictionMap.has(sample)){return this.predictionMap.get(sample);}
    else {return null;}
  }

  // Remove a prediction
  del(sample){
    let label = this.getPred(sample);
    if (label === null){
      globLog.log('AI',"No Prediction",sample,"to remove");
    }
    else {
      globLog.log('AI',"Remove Prediction",sample,"("+label+")");
      this.predictionMap.delete(sample);
      POST_delPred(sample);
    }
    return this;
  }

  // CLear prediction around sample
  clearPred(sample){
    let range = this.getRange(sample-globSettings.pred_clear_range,sample+globSettings.pred_clear_range);
    for (const [sample, label] of range.entries()){
      this.del(sample);
    }
  }


  // Get most likely prediction at sample
  get_prediction_at(target_sample){
    let pred_label = null;
    let dist_cur = Infinity;
    let sample_cur = null;
    for (const [sample, label] of this.predictionMap.entries()){
      if(sample<target_sample){
        pred_label=label;
        dist_cur = target_sample - sample;
        sample_cur = sample;
      }
      else {
        let distance = sample - target_sample;
        // check if the next sample is closer than the last one
        if (distance < dist_cur){
          pred_label=label;
          dist_cur = distance;
          sample_cur = sample;
        }
        break;
      }
    }
    return [pred_label, sample_cur, dist_cur];
  }

}

// ************************ //
//                          //
//          Canvas          //
//                          //
// ************************ //

class TimeStamps{
  stepsize;
  constructor(time_delta,min_bg_markers,max_bg_markers){

    let markers = (min_bg_markers+max_bg_markers)/2;
    let step = time_delta/markers;
    let f = 1;
    while (step<1){step=step*10;f=f/10;}
    while (step>10){step=step/10;f=f*10;}
    this.stepsize = Math.round(step)*f;

    // dis_min = 1;
    // step_size = 1;
    // console.log("time_delta =",time_delta,"t =",t,"factor =",f);
    // for (let markers=min_bg_markers; markers<=max_bg_markers; markers++){
    //   let step = time_delta/markers;
    //   let f = 1;
    //   while (step>10){step=step/10;f=f*10}
    //   while (step<1){step=step*10;f=f/10}
    //   let dis = 
    //   console.log("Markers =",markers,"step =",step);
    // }
    // let avg_bg_markers = (min_bg_markers+max_bg_markers)/2;
    // let avg_step = time_delta/avg_bg_markers;
  }

  get milli_seconds(){
    return this.stepsize < 1;
  }

  get_range(start_time,end_time){
    let stamps = [];
    let stamp = this.stepsize*Math.floor(start_time/this.stepsize);
    while (stamp < end_time){
      stamps.push([stamp, get_time_stamp_str(stamp,this.milli_seconds)]);
      stamp += this.stepsize;
    }
    return stamps;
  }
}

function get_time_stamp_str(seconds,milli_precision=false){
  let text = '';

  if (seconds < 0) {
    seconds = -seconds;
    text=text+'-';
  }

  let hh = Math.floor(seconds / 3600);
  seconds = seconds - hh * 3600;
  let mm = Math.floor(seconds / 60);
  seconds = seconds - mm * 60;
  let ss = Math.floor(seconds);

  
  
  if (milli_precision){
    let ms = Math.round(1000*(seconds - ss));
    if (ms>=1000){
      ms-=1000;
      ss+=1;
    }
    if (ms < 10) {ms = "00"+ms;}
    else if (ms < 100) {ms = "0"+ms;}
    text = text + ss + '.' + ms;
  }
  else {
    if (hh < 10) {hh = "0"+hh;}
    if (mm < 10) {mm = "0"+mm;}
    if (ss < 10) {ss = "0"+ss;}
    if (hh>0){text = text+hh+':'}
    text = text + mm +':'+ss;
  }

  return text;
}

// ************************ //
//                          //
//        Annotation        //
//                          //
// ************************ //

class Annotation {
  annoMap;
  labels;
  #selectedSample_;
  #originalSample_;
  
  constructor(annoObj=null,last_sample=null){
    this.annoMap = SortedArrayMap();
    this.labels = new Set(["Still","Walking","Run","Bike","Car","Bus","Train","Subway"]);
    this.#selectedSample_ = null;
    this.#originalSample_ = null;

    if (last_sample !== null){
      this.annoMap.set(parseInt(last_sample),"_none_");
    }

    if (annoObj !== null){
      for (const [sample, label] of Object.entries(annoObj)) {
        this.setAnno(parseInt(sample),String(label));
        //this.labels.add(String(label));
      };
    }

    this.setSelectBox();
  }
  
  get selectedSample(){return this.#selectedSample_;}
  set selectedSample(val){
    globLog.log('Anno',"Set selected sample to",val);
    this.#selectedSample_ = val;
  }

  get originalSample(){return this.#originalSample_;}
  set originalSample(val){
    globLog.log('Anno',"Set origin sample to",val);
    this.#originalSample_ = val;
  }

  setAnno(sample,label){
    globLog.log('Anno',"Add sample",sample,"("+label+")");
    this.annoMap.set(sample,label);

    // Add new label to selection
    if (label !== '_none_' && !this.labels.has(label)){
      this.labels.add(label);
      this.setSelectBox();
    } 

    // Remove prediction
    globPred.clearPred(sample);

    return this;
  }

  add(sample,label){
    sample = parseInt(sample);
    if (label === ''){
      label = '_none_';
    }
    
    this.setAnno(sample,label);
    POST_addAnno(sample,label);

    return this;
  }

  del(sample){
    let label = this.getAnno(sample);
    if (label === null){
      globLog.log('Anno',"No sample",sample,"to remove");
    }
    else {
      globLog.log('Anno',"Remove sample",sample,"("+label+")");
      this.annoMap.delete(sample);
      POST_delAnno(sample);
    }
    return this;
  }

  // returns the last annotation before the given sample
  get_last_anno(target_sample){
    let last_sample = null;
    let last_label = null;
    for (const [sample, label] of this.annoMap.entries()){
      if (sample > target_sample){
        break;
      }
      last_sample = sample;
      last_label = label;
    }
    return [last_sample, last_label]
  }

  get_anno_at(target_sample){
    [last_sample, last_label] = get_last_anno(target_sample);
    return last_sample;
  }

  // Returns every breakpoint within a given range + the leading annotation
  getRange(start,stop,add_init=false,set_stop_point=false){
    var map = SortedArrayMap();
    var init_point = null;

    for (const [sample, label] of this.annoMap.entries()){

      if(sample<=start){
        if (add_init){
          init_point = [sample, label];
        }
        continue;
      }

      if(init_point != null){
        map.set(init_point[0],init_point[1]);
        init_point = null;
      }

      if(sample>=stop){
        break;
      }

      map.set(sample,label);
    }

    if (set_stop_point){
      map.set(stop,'_none_');
    }
    
    return map;
  }

  // Returns the label at the given point or null if none is set
  getAnno(sample){
    if (this.annoMap.has(sample)){return this.annoMap.get(sample);}
    else {return null;}
  }

  // Modify the selection popup to show all classes
  setSelectBox(){
    var box = document.getElementById("anno_select");
    if (box === null){
      globLog.log('Anno',"Selection Box not loaded yet");
      return this;
    }

    var options = "<option value=''><i>No Label</i></option>";

    for (let label of this.labels.values()){
      options += "\n<option value='" + label + "'>" + label + "</option>";
    }
    
    box.innerHTML = options;
    return this;
  }
}


// ************************ //
//                          //
//         Logging          //
//                          //
// ************************ //

function getTimestamp() {
  const pad = (n,s=2) => (`${new Array(s).fill(0)}${n}`).slice(-s);
  const d = new Date();
  
  return `${pad(d.getFullYear(),4)}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

class Logger {
  #active_buffer;
  #buffer_0;
  #buffer_1;

  constructor(_logSettings,delay=100,decimalPlace=2){
    this.logSettings = _logSettings;
    this.delay = delay;
    this.decimalPlace = decimalPlace;

    this.#active_buffer = 0;
    this.#buffer_0 = new Array();
    this.#buffer_1 = new Array();

    setTimeout(()=>this.start_logging(),this.delay);
  }

  start_logging(){
    this.#active_buffer = 1-this.#active_buffer;

    var log_txt;
    if (this.#active_buffer == 0){
      log_txt = this.#buffer_1.join('\n');
      this.#buffer_1.length = 0;
    }
    else {
      log_txt = this.#buffer_0.join('\n');
      this.#buffer_0.length = 0;
    }

    if (log_txt != ''){
      POST_log(log_txt);
    }
    
    setTimeout(()=>this.start_logging(),this.delay);
  }



  async write(...args){
    let time = getTimestamp();
    console.log(time,'|',...args);
    let txt = time + ' | ' + args.join(' ');

    if (this.#active_buffer == 0){
      this.#buffer_0.push(txt);
    }
    else {
      this.#buffer_1.push(txt);
    }
  }

  async log(type, ...args){

    // do rounding if required
    if (this.decimalPlace !== null){
      for(var i = 0; i < args.length; ++i){
        if (isNumber(args[i])){
          args[i] = roundNumber(args[i],this.decimalPlace);
        }
      }
    }

    if (type=='Filler'){
      this.write("--------------");
    }
    else if (type in this.logSettings){
      if (this.logSettings[type]){
        this.write('['+type+']', ...args);
      }
    }
    else if (type == "Error"){
      this.write('[ERROR]', ...args);
    }
    else {
      this.write("UNKNOWN TYPE:",type);
      this.write('['+type+']', ...args);
    }
  }

  setSetting(setting,active){
    this.log("Settings","Clicked " + setting + ", new value = " + active);
    this.logSettings[setting] = active;
    POST_logSetting(setting,active);
  }
}