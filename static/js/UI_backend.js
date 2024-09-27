// ************************ //
//                          //
//         Settings         //
//                          //
// ************************ //

class Settings {

  // ###################
  // #   UI Settings   #
  // ###################

  signal_canvas_height = 200;
  time_canvas_height = 20;
  

  // ###############
  // #   Tracker   #
  // ###############
  
  // Recalculate 
  #_sample_rate;
  #_sample_number;
  #_video_offset;
  #_video_spdup;
  #_frame_number;

  #_is_drawing = false;
  #_time_cur = null;
  #_time_stamps;

  #_start_samples;
  #_first_sample;
  #_last_sample;

  #_buffer;

  constructor(
    modus,
    project_name = 'unnamed',

    sample_rate = 1.0, 
    sample_number = 0,

    video_path = "",
    video_width = 0,
    video_height = 0,
    video_fps = 0.0,

    video_offset = 0.0,
    video_spdup = 1.0,
    frame_number = 0, 
    
    max_samples = 100,
    max_bg_markers = 100,
    pred_clear_range = 100,
    marker_snap_range = 10,

    buffer_rate = 5.0, 
    play_speed = 1.0,
    max_play_speed = 1000.0,
    refresh_rate = 1.0, 
    signal_zoom = 1.0,
    min_zoom = 0.1,

    target_seconds = 0,
    ){
    this.isPlaying = false;
    this.project_name = project_name;
    this.modus = modus;

    // #################
    // #   Constants   #
    // #################

    // Sampling Rate of the sensor signal in Hz
    this.#_sample_rate = sample_rate;

    // Number of samples in the signal
    this.#_sample_number = sample_number;

    // Number of samples after which the video starts
    this.#_video_offset = video_offset;

    // Speed up factor of the video file
    this.#_video_spdup = video_spdup;

    // Number of frames in the video
    this.#_frame_number = frame_number;
  
    // General Video information
    this.video_path = video_path;
    this.video_width = video_width;
    this.video_height = video_height;
    this.video_fps = video_fps;

    // ###################
    // #   UI Settings   #
    // ###################

    // Number of samples drawn on a signal screen
    this.max_samples = max_samples;

    // Number of vertical sample indicators displayed on a signal screen
    this.max_bg_markers = max_bg_markers;

    // Sample tolerance to remove predictions around placed annotations
    this.pred_clear_range = pred_clear_range;

    // Range of pixel left and right of annotation marker which register mouse clicks
    this.marker_snap_range = marker_snap_range;


    // ################
    // #   Settings   #
    // ################

    // Ratio of the current displayed signal length stored in buffer (Should be at least 2.0)
    this.buffer_rate = buffer_rate;

    // Playspeed control element
    this.speed_ctrl = new PlaySpeed(play_speed,0.25,max_play_speed);

    // Zoom control element
    this.zoom_ctrl = new LogSlider({minval:min_zoom,maxval:this.samples_per_frame/3});

    // Sample progress control element
    this.sample_ctrl = new BasicSlider({minval:0,maxval:sample_number});

    // Refreshs of the display in seconds (relevant for smooth signal moving)
    this.refresh_rate = refresh_rate;

    // Ratio of frame signal window to screen signal window 
    // 0.5 - 2 frame signal window are displayed at once (zoom out)
    // 1.0 - the length of the signal for one frame window will be displayed
    // 2.0 - half of the frame signal will be displayed (zoom in)
    this.signal_zoom = signal_zoom;

    // Set timer if required
    if (target_seconds > 0){
      this.timer = new Timer(target_seconds);
    }
    else {
      globLog.log('Timer',"No timer set.");
      this.timer = null;
    }

    // Calculate first and last samples
    this.calc_samples();

    // ###################
    // #   Signal Data   #
    // ###################
    
    this.set_buffer();


    // #####################
    // #   AI Assistance   #
    // #####################

    this.AI_ctrl = new AI_CTRL(this.delay,false);

  }


  // ###############
  // #   Getters   #
  // ###############

  get sample_rate(){return this.#_sample_rate;}
  get sample_number(){return this.#_sample_number;}
  get video_offset(){return this.#_video_offset;}
  get video_spdup(){return this.#_video_spdup;}
  get frame_number(){return this.#_frame_number;}

  get time_cur(){return this.#_time_cur}
  get sample(){if (this.time_cur===null) return null; else return this.time2sample(this.time_cur);}
  get frame(){if (this.time_cur===null) return null; else return this.time2frame(this.time_cur);}
  get first_sample(){return this.#_first_sample;}
  get last_sample(){return this.#_last_sample;}
  get time_stamps(){return this.#_time_stamps.get_range(this.start_time,this.stop_time);}

  // First sample displayed
  get start_sample(){return this.sample-.5*this.samples_per_screen;}
  get start_time(){return this.sample2time(this.start_sample);}

  // Last sample displayed
  get stop_sample(){return this.sample+.5*this.samples_per_screen;}
  get stop_time(){return this.sample2time(this.stop_sample);}

  // How many signal samples cover the length of one frame
  get samples_per_frame(){
    return this.video_spdup * this.sample_rate / (this.video_fps);
  }

  // How many signal samples are represented at once
  get samples_per_screen(){
    return this.samples_per_frame / this.signal_zoom;
  }

  // How many signal samples are actually plotted
  get samples_displayed(){
    return Math.min(this.samples_per_screen, this.max_samples);
  }

  // Length of the delay before refreshing the display in ms
  get delay(){
    return 1000 / this.refresh_rate;
  }

  // Returns true while keyboard hotkeys are active
  get hotkeys_active(){
    return globAnno.selectedSample === null;
  }

  // ###############
  // #   Setters   #
  // ###############

  set time_cur(val){this.#_time_cur = val;}

  set sample_rate(val){if (val!=0){this.#_sample_rate=val;this.calc_samples();}}
  set sample_number(val){this.#_sample_number=val;this.calc_samples();}
  set video_offset(val){this.#_video_offset=val;this.calc_samples();}
  set video_spdup(val){this.#_video_spdup=val;this.calc_samples();}
  set frame_number(val){this.#_frame_number=val;this.calc_samples();}
  
  setSetting(setting,value){
    globLog.log("Settings","Set",setting,"to",value);
    this[setting] = value;
    POST_setting(setting,this[setting]);
  }


  // ####################
  // #    Playback     #
  // ####################

  async startPlay(){
    globLog.log('Playback',"Start Play!");
    this.isPlaying = true;
    this.AI_ctrl.resume();
    setTimeout(()=>UpdateStream(new Date()),this.delay);
    refreshButtons();
  }
  
  stopPlay(){
    globLog.log('Playback',"Stop Play!");
    this.isPlaying = false;
    this.AI_ctrl.pause();
    this.sync_time();
    refreshButtons();
  }
  
  togglePlay(msg){
    globLog.log('Playback',"Toggle Play!");
    if (this.isPlaying){this.stopPlay();}
    else if (this.can_move_forwards()){this.startPlay();}
  }

  cancel_move(del_pred=false){
    this.speed_ctrl.cancel_move(del_pred);
  }

  get play_speed(){return this.speed_ctrl.value;}
  set play_speed(val){this.speed_ctrl.value = val;}

  get play_speed_pos(){return this.speed_ctrl.position;}
  set play_speed_pos(pos){this.speed_ctrl.position = pos;}

  get max_play_speed(){return this.speed_ctrl.max_play_speed;}
 
  // ###############
  // #    Zoom     #
  // ###############
  
  get zoom_lvl(){return this.signal_zoom;}
  set zoom_lvl(val){this.zoom_to(val);}

  get zoom_pos(){return this.zoom_ctrl.get_position(this.signal_zoom);}
  set zoom_pos(val){this.zoom_to(this.zoom_ctrl.get_value(val));}
  
  async zoom_to(zoom_lvl){
    zoom_lvl = Math.max(this.zoom_ctrl.minval,Math.min(this.zoom_ctrl.maxval,zoom_lvl));
    this.setSetting("signal_zoom",zoom_lvl);
    let promise_buffer = this.set_buffer();
    this.calc_samples();
    document.getElementById("slider_zoom").value = this.zoom_pos;
    document.getElementById("input_zoom").value = zoom_lvl;
    await promise_buffer;
    this.redrawSample();
  }

  // ##################
  // #  Calculations  #
  // ##################

  time2sample(time){
    return time * this.sample_rate;
  }

  sample2time(sample){
    return sample / this.sample_rate;
  }

  sample2frame(sample){
    return parseInt( ( (sample - this.video_offset) * this.video_fps ) / (this.video_spdup * this.sample_rate) );
  }

  frame2start_sample(frame){
    return this.video_offset + (frame * this.video_spdup * this.sample_rate) / this.video_fps;
  }

  time2frame(time){
    return this.sample2frame(this.time2sample(time));
  }

  frame2start_time(frame){
    return this.sample2time(this.frame2start_sample(frame));
  }

  get_start_samples_in_range(start, stop){
    return this.#_start_samples.filter(sample => sample>start && sample<stop);
  }


  // ###############
  // #  Functions  #
  // ###############


  can_move_backwards(){return this.sample > this.first_sample;}
  can_move_forwards(){return this.sample < this.last_sample;}

  // Todo: add flag to make optional
  check_stop_play(){if (true) {this.stopPlay();}}

  moveFirst(){this.check_stop_play(); this.setSample(this.first_sample);}
  movePrev(){ this.check_stop_play(); if(this.can_move_backwards()) this.setFrame(this.frame-1);}
  moveNext(){ this.check_stop_play(); if(this.can_move_forwards()) this.setFrame(this.frame+1);}
  moveLast(){ this.check_stop_play(); this.setSample(this.last_sample);}

  // Sync the current sample with the backend
  async sync_time(){POST_setting("time_cur",this.time_cur);}

  async set_buffer(){
    //globLog.log("Settings","Set Buffer start =",this.start_sample);
    this.#_buffer = new Buffer(this.samples_per_screen * this.buffer_rate, this.sample_number);
    if (this.sample!==null){
      await this.#_buffer.setStart(parseInt(this.start_sample));
    }
  }

  calc_samples(){
    // Calculate the first sample of each frame
    this.#_start_samples = SortedSet();

    for (let frame = 0; frame < this.frame_number; frame += 1){
      this.#_start_samples.push(this.frame2start_sample(frame));
    }

    // Calculate time stamps
    let time_delta = this.sample2time(this.samples_per_screen);
    this.#_time_stamps = new TimeStamps(time_delta, parseInt(max_bg_markers*(2/3)), max_bg_markers);

    // Calculate first and last samples
    this.#_first_sample = Math.min(0,this.frame2start_sample(0));
    this.#_last_sample = Math.max(this.sample_number-this.samples_per_frame,this.frame2start_sample(this.frame_number-1));
  
  }

  async get_signal_data(start_,stop_){
    //globLog.log('Buffer',"Start:",this.sample,"Stop:",this.sample+this.samples_per_screen,"Samples:",this.samples_per_screen)
    let data = await this.#_buffer.get_data(start_,stop_);
    //let data = await this.#_buffer.get_data(this.sample-this.half_samples_per_screen, this.sample+this.half_samples_per_screen);
    return data;
    //return GET_SignalData(this.sample,this.sample+this.samples_per_screen);
  }

  setSample(sample,prevent_reload=true){
    if (this.sample == sample && prevent_reload){return;}
    this.setDisplay(this.sample2time(sample));
    this.sync_time();
  }

  setFrame(frame){
    if (this.frame == frame){return;}
    this.setDisplay(this.frame2start_time(frame));
    this.sync_time();
  }

  // Used for replay, add given ms to current time stamp while factoring in playback speed
  async addTime(ms){
    await this.setDisplay(this.time_cur+this.play_speed*(ms/1000));
  }

  async setDisplay(time){
    let old_frame = this.frame;
    this.time_cur = time;
 
    refreshButtons();
    if(this.frame != old_frame){
      drawFrame();
      this.sync_time();
    }
    this.redrawSample();
    document.getElementById("slider_sample").value = this.sample_ctrl.get_position(this.sample);
  }

  async redrawSample(){
    if (this.#_is_drawing){
      globLog.log('Canvas',"Can't draw time",this.time_cur,"since canvas is locked.");
      return false;
    }
    else {
      this.#_is_drawing = true;
      globLog.log('Canvas',"Draw time",this.time_cur);
      await Promise.allSettled([drawSample(), drawAnno()]);
      this.#_is_drawing = false;
      return true;
    }
  }

  // Close the tool
  async close_tool(){
    // Prepare backend
    await POST_finish_tool();

    // Refresh page for new content
    location.reload();
  }
}

// ************************ //
//                          //
//      AI Controller       //
//                          //
// ************************ //

class AI_CTRL {
  #running_ = false;

  // last max sample to be checked
  #last_sample = null;

  constructor(delay,running=false){
    this.delay = Math.min(200,delay);
    this.#running_ = running;
    globLog.log('AI',"Task controller delay =",delay);
  }

  resume(){
    globLog.log('AI',"Task controller is running.")
    this.#running_ = true;
    setTimeout(()=>this.step(),0);
  }

  pause(){
    globLog.log('AI',"Task controller stopped.")
    this.#running_ = false;
  }

  get isRunning(){return this.#running_;}

  step(){
    if (!this.isRunning){return;}

    let SPS = globSettings.samples_per_screen;
    let start = Math.max(globSettings.start_sample,this.#last_sample+1);
    let stop = globSettings.stop_sample;

    let s0 = start;
    let s1 = stop+1;

    
    const [sample, label] = globPred.getFirstInRange(s0,s1);
    globLog.log('AI',"Check preds in range",s0,"-",s1,":",sample,label);

    if (sample !== null){
      
      // Arguments?
      const target_speed = 0.1;
      const constant_time = 2.5;

      const constant_samples = target_speed * constant_time * globSettings.samples_per_frame;
      const target_sample = sample - 0.5 * constant_samples;

      let start_sample = globSettings.sample;

      globLog.log('AI',"Slow down around sample",sample,"to indicate label",label);
      setTimeout(()=>globSettings.speed_ctrl.slow_around(sample,start_sample,target_sample,target_speed,constant_samples),0);   
    }

    this.#last_sample = stop;
    setTimeout(()=>this.step(),this.delay);
  }
}

// ************************ //
//                          //
//          Setup           //
//                          //
// ************************ //

var globSettings = null;
var globLog = null;
var globAnno = null;
var globPred = null;
async function Setup(page="Tool"){
  let _settings = await GET_Settings();
  globLog = new Logger(_settings['log_settings'],_settings['log_path']);
  globLog.log("Setup","Page \""+page+"\" - Loaded Settings:",_settings);
  globSettings = new Settings(
      modus             = _settings['modus'],
      project_name      = _settings['project_name'],

      sample_rate       = _settings['sample_rate'], 
      sample_number     = _settings['sample_number'], 

      video_path        = _settings['video_path'],
      video_width       = _settings['video_width'],
      video_height      = _settings['video_height'],
      video_fps         = _settings['video_fps'],

      video_offset      = _settings['video_offset'], 
      video_spdup       = _settings['video_spdup'], 
      frame_number      = _settings['frame_number'],

      max_samples       = _settings['max_samples'],
      max_bg_markers    = _settings['max_bg_markers'],
      pred_clear_range  = _settings['pred_clear_range'],
      marker_snap_range = _settings['marker_snap_range'],

      buffer_rate       = _settings['buffer_rate'],
      play_speed        = _settings['play_speed'],
      max_play_speed    = _settings['max_play_speed'], 
      refresh_rate      = _settings['refresh_rate'], 
      signal_zoom       = _settings['signal_zoom'],
      min_zoom       = _settings['min_zoom'],

      target_seconds    = _settings['target_seconds'],
    );
  globLog.log("Setup","Settings done");

  if (page=="Tool"){
    let promise_anno = GET_Annotation();

    // Set up AI assistance
    if (globSettings.modus['AI']){
      let _predObj = await GET_Prediction();
      globLog.log('AI',"Support activated");
      globPred = new Predictions(_predObj);
    }
    else {
      globLog.log('AI',"Support not activated");
      globPred = new Predictions();
    }
    
    // Set up existing annotation afterwards remove superflous predictions
    let _annoObj = await promise_anno;
    globAnno = new Annotation(_annoObj,globSettings.sample_number);
    
    await setUI();
    globSettings.setDisplay(_settings['time_cur'],prevent_reload=false);
  }
  
  if (page=="Settings")
  {
    setSettingUI();
  }

  if (page=="Logging"){
    setLogSel();
  }

}


// ************************ //
//                          //
//           GET            //
//                          //
// ************************ //

// Get JSON data from Backend
async function GET_JSON(url){
  if (globLog !== null){globLog.log("GET",url);}
  const res = await fetch(url);
  const json = await res.json();
  return await json.data;
}

async function GET_Annotation(){
  return GET_JSON(url_current_labels);
}

async function GET_Prediction(){
  return GET_JSON(url_current_prediction);
}

async function GET_Settings(){
  return GET_JSON(url_play_settings);
}

async function GET_StartSample(frame){
  return GET_JSON(get_start_signal_url(frame));
}

async function GET_SignalData(start,stop,samples){
  let data = await GET_JSON(get_signal_data_url(start,stop,samples));
  var dict = new Object();
  for (const [key, value] of Object.entries(data)) {
    dict[key] = JSON.parse(value);
  }
  return dict;
}


// ************************ //
//                          //
//           POST           //
//                          //
// ************************ //

async function POST_JSON(url, data){
  globLog.log("POST",url,data);
  return fetch(url, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(data)
  });
}

async function POST_log(txt){
  return fetch(url_logging, {
    method: 'PUT',
    headers: {'Content-Type': 'text/plain'},
    body: txt
  });
}

async function POST_finish_tool(){
  let data = {'type': 'finish_tool'};
  return POST_JSON(url_play_settings, data);
}

async function POST_logSetting(setting,active){
  let data = {'type': 'logSetting', 'setting': setting, 'active': active};
  return POST_JSON(url_play_settings, data);
}

async function POST_setting(setting,value){
  let data = {'type': 'Setting', 'setting': setting, 'value': value};
  return POST_JSON(url_play_settings, data);
}

async function POST_addAnno(sample,label){
  let data = {'target': 'label', 'type': 'Add', 'sample': sample, 'label': label};
  return POST_JSON(url_submit_anno, data);
}

async function POST_delAnno(sample){
  let data = {'target': 'label', 'type': 'Del', 'sample': sample};
  return POST_JSON(url_submit_anno, data);
}

async function POST_addPred(sample,label){
  let data = {'target': 'pred', 'type': 'Add', 'sample': sample, 'label': label};
  return POST_JSON(url_submit_anno, data);
}

async function POST_delPred(sample){
  let data = {'target': 'pred', 'type': 'Del', 'sample': sample};
  return POST_JSON(url_submit_anno, data);
}