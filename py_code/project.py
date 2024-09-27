import json
import os
from datetime import datetime, timedelta

from py_code.dataset import parse_dataset_arguments
from py_code.project_signal import Signal
from py_code.project_video import Video
from py_code.project_annotation import Annotation

default_logger = {
    'AI': True,
    'Anno': True,
    'Buffer': True,
    'Canvas': True,
    'GET': True,
    'Hotkey': True,
    'Input': True,
    'Mouse': True,
    'Playback': True,
    'POST': True,
    'Settings': True,
    'Setup': True,
    'Speed': True,
    'Timer': True,
    'Video': True,
}

def get_project(args):

    args = parse_dataset_arguments(args)
    return Project( project_name=args.name,

                    video_path=args.video_path,

                    video_offset=args.video_offset,
                    offset_path=args.offset_path,

                    video_spdup=args.video_spdup,
                    spdup_path=args.spdup_path,

                    video_opacity=args.video_opacity,

                    signal_path=args.signal_path,
                    sample_rate=args.sample_rate,

                    pred_name=args.pred_name,
                    pred_path=args.pred_path,
                    label_path=args.label_path,

                    max_samples=args.max_samples,
                    max_bg_markers=args.max_bg_markers,
                    pred_clear_range=args.pred_clear_range,
                    marker_snap_range=args.marker_snap_range,

                    buffer_rate=args.buffer_rate,
                    refresh_rate=args.refresh_rate,

                    play_speed=args.play_speed,
                    max_play_speed=args.max_play_speed,

                    signal_zoom=args.signal_zoom,
                    min_zoom=args.min_zoom,

                    time_cur=args.time_cur,
                    time_run=args.time_run,

                    modus={
                        'debug':args.debug,
                        'clear':args.clear,
                        'hide_settings':args.hide_settings,
                        'restrict_labels':args.restrict_labels,
                        'study':args.study,
                        'AI':args.AI,
                        'absolute_paths':args.absolute_paths,
                        'close_button':args.close_button,
                        },
                )

class Project:
    def __init__(   self,

                    project_name:str        = None,
                    signal_path:str         = None,
                    video_path:str          = None,

                    sample_rate:float       = 1.,
                    
                    video_offset:float      = 0.,
                    offset_path:str         = None,

                    video_spdup:float       = 1.,
                    spdup_path:str          = None,

                    video_opacity:float     = 1.,

                    pred_name:str           = None,
                    pred_path:str           = None,
                    label_path:str          = None,

                    max_samples:int         = 200,
                    max_bg_markers:int      = 20,
                    pred_clear_range:int    = 100,
                    marker_snap_range:float = 5,

                    buffer_rate:float       = 20.,
                    refresh_rate:float      = 24.,  # Refreshs per second

                    play_speed:float        = 1,
                    max_play_speed:float    = 1000.,

                    signal_zoom:float       = 1.,
                    min_zoom:float          = 0.1,

                    time_cur:float          = 0.,
                    time_run:float          = 0.,

                    log_settings:dict       = default_logger,
                    modus:dict              = None,
                ):    
        self.arguments = locals()
        del self.arguments['self']
        self.params = list(self.arguments)
        del self.arguments['project_name']
 
        self.clear = modus['clear']

        self.project_name = None
        if project_name != None:
            self.set_project_name(project_name)

        
        
    def set_project_name(self,project_name:str):
        if project_name == None or project_name == '':
            return False

        self.project_name = project_name

        # Project folder
        self.path = os.path.join("static/uploads/project", project_name)
        if not os.path.exists(self.path):
            os.makedirs(self.path, exist_ok=True)

        # Load Settings
        self.path_settings = os.path.join(self.path,'settings.json')
        if not self.clear and os.path.exists(self.path_settings):
            with open(self.path_settings) as f:
                data = json.load(f)
                self.__dict__.update(data)
                print("Loaded Settings from file.")

            # check any new settings
            new = {k:v for k,v in self.arguments.items() if k not in self.__dict__}
            if len(new) > 0:
                print("New Settings:",new)
                self.__dict__.update(new)
        else:
            self.__dict__.update(self.arguments)
            print("Loaded Settings from arguments.")

        assert self.min_zoom > 0

        # Log paths
        self.path_log_js = os.path.join(self.path,'log_js.txt')
        self.path_log_py = os.path.join(self.path,'log_js.txt')

        # Prediction
        if self.pred_name is not None:
            self.path_prediction = os.path.join("static/uploads/pred", self.pred_name)
        else:
            self.path_prediction = None

        self.buffer_rate = max(1.0,self.buffer_rate)

        # Get Video Offset
        if self.offset_path is not None:
            with open(self.offset_path) as f:
                line = f.readline()
                self.video_offset = float(line.split()[1])
        
        # Get Video Speedup
        if self.spdup_path is not None:
            with open(self.spdup_path) as f:
                line = f.readline()
                self.video_spdup = float(line)
            
        self.video = None
        self.signal = None

        self.set_video()
        self.set_signal()
        self.set_label()
        self.set_pred()

        if self.time_run == 0:
            self.target_seconds = 0
        else:
            self.target_seconds = (datetime.now() + timedelta(seconds=self.time_run)).timestamp()

        self.save_settings()

        print("Created Project",project_name)
        print("Passed Settings:",self.get_pass_settings())

        return True


    #########################
    #                       #
    #        Settings       #
    #                       #
    #########################
    
    def get_pass_settings(self):
        return {k:self.__dict__[k] for k in self.params}

    def save_settings(self):
        # Serializing json
        json_object = json.dumps(self.get_pass_settings(), indent=4)
        
        # Writing to file
        with open(self.path_settings, "w") as outfile:
            outfile.write(json_object)
            print("Saved Settings to file.")


    #########################
    #                       #
    #        Logging        #
    #                       #
    #########################

    def log_js(self,txt):
        with open(self.path_log_js, "a+") as file:
            file.write(txt+'\n')


    #########################
    #                       #
    #     Signal Handling   #
    #                       #
    #########################

    def set_signal(self):
        self.signal = Signal(
                        path=self.signal_path, 
                        channels= ['Acc X', 'Acc Y', 'Acc Z'],
                        normalize = True,
                        flip = True,
                        drop_gravity_channel = None)

    #########################
    #                       #
    #     Video Handling    #
    #                       #
    #########################

    def set_video(self):
        self.video = Video(path=self.video_path,opacity=self.video_opacity)

    def get_frame_video(self,frame:int):
        return self.video.get_frame(frame)


    #########################
    #                       #
    #     Label Handling    #
    #                       #
    #########################

    def set_label(self):
        self.label = Annotation(type_="Anno",path_=os.path.join(self.path,'anno.json'),SHL_label_file=self.label_path)

    def set_pred(self):
        self.pred = Annotation(type_="Pred",path_=os.path.join(self.path,'pred.json'),SHL_label_file=self.pred_path,points=self.get_prediction_file())

    def verify_labels(self):
        ''' Checks the integrity of the current annotation '''
        return False

    #########################
    #                       #
    #      Predictions      #
    #                       #
    #########################

    def get_prediction_file(self):
        data = {}
        if self.path_prediction is not None and os.path.exists(self.path_prediction):
            with open(self.path_prediction) as f:
                data = json.load(f)
        else:
            print(f"No prediction file at {self.path_prediction}")
        return data