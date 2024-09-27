from pathlib import Path
import sys
path_root = Path(__file__).parents[1]

# Add parent folder to sys path
sys.path.append(str(path_root))

import argparse
from flask import Flask, jsonify, render_template, request, redirect, url_for, Response, send_file
from pathlib import Path
import warnings
import werkzeug

from py_code.project import Project, get_project
from py_code.utils import get_default_args

# default int is unsigned - https://github.com/pallets/flask/issues/2643
class SignedIntConverter(werkzeug.routing.IntegerConverter):regex = r'-?\d+'


Path("static/uploads/pred").mkdir(parents=True, exist_ok=True)
Path("static/uploads/signal").mkdir(parents=True, exist_ok=True)
Path("static/uploads/project").mkdir(parents=True, exist_ok=True)
Path("static/uploads/video").mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
app.url_map.converters['signed_int'] = SignedIntConverter
project = None

###########
# General #
###########

def data2JSON(data,print_resp=True):
    message = {
        'status': 200,
        'message': 'OK',
        'data': data
    }
    resp = jsonify(message)
    resp.status_code = 200
    if print_resp:
        print(resp)
    return resp


#########
# Video #
#########

@app.route('/video_frame/<signed_int:frame>')
def video_frame(frame):
    return Response(project.get_frame_video(frame), mimetype='multipart/x-mixed-replace; boundary=frame')


##########
# Signal #
##########

@app.route('/signal_data/<signed_int:start>_<signed_int:stop>_<signed_int:samples>')
def signal_data(start, stop, samples):
    return data2JSON(project.signal.get_data_window_json(start, stop, samples))


##############
# Annotation #
##############

@app.route('/submit_anno', methods=['POST'])
def submit_anno():
    data = request.get_json()
    print("submit anno:",data)

    target = data.get('target',None)
    if target == 'label':
        src = project.label
    elif target == 'pred':
        src = project.pred
    else:
        return f"Unknown target: {target} data: {data} request: {request}", 404

    type = data.get('type',None)
    if type == 'Add':
        status, msg = src.add_anno(int(data['sample']),data['label'])
    elif type == 'Del':
        status, msg = src.del_anno(int(data['sample']))
    else:
        return  f"Unknwon type '{type}' data: {data} request: {request}", 404
 
    return msg, 200 if status else 404


@app.route('/current_labels', methods=['GET'])
def current_labels():
    return data2JSON(project.label.get_anno_dict())

@app.route('/current_prediction', methods=['GET'])
def current_prediction():
    return data2JSON(project.pred.get_anno_dict())


##########
# Status #
##########

@app.route('/log_js', methods=['PUT'])
def log_js():
    project.log_js(str(request.data.decode('UTF-8')))
    return 'Log written', 200


@app.route('/IO_settings', methods=['GET','POST'])
def IO_settings():
    if request.method == 'POST':
        data = request.get_json()
        print("settings/request data:",data)
        error = None
        type = data.get('type',None)
        if type is None:
            error = f"No type to post settings declared. data: {data} request: {request}"
        elif type == 'logSetting':
            project.log_settings[data['setting']] = data['active']
        elif type == 'Setting':
            setting = data.get('setting',None)
            value = data.get('value',None)
            if setting is None or value is None:
                error = f"Recieved Setting {setting} with value={value}"
            elif setting == 'sample_rate': project.sample_rate = float(value)
            elif setting == 'video_offset': project.video_offset = float(value)
            elif setting == 'video_spdup': project.video_spdup = float(value)
            elif setting == 'buffer_rate': project.buffer_rate = float(value)
            elif setting == 'play_speed': project.play_speed = float(value)
            elif setting == 'max_play_speed': project.max_play_speed = float(value)
            elif setting == 'refresh_rate': project.refresh_rate = float(value)
            elif setting == 'signal_zoom': project.signal_zoom = float(value)
            elif setting == 'min_zoom': project.min_zoom = float(value)
            elif setting == 'time_cur': project.time_cur = float(value)
            else:
                error = f"Could not find Setting {setting} with value={value}"
        else:
            error = f"Unknwon type '{type}' to post settings declared. data: {data} request: {request}"
        
        if error is None:
            project.save_settings()
            return 'Setting update successful', 200
        else:
            return error, 404
    
    elif request.method == 'GET':
        dict_obj = {
                    'project_name':     project.project_name,
                    'sample_rate':      project.sample_rate,
                    'sample_number':    project.signal.length,

                    'video_path':       project.video.name,
                    'video_width':      project.video.width,
                    'video_height':     project.video.height,
                    'video_fps':        project.video.FPS,

                    'video_offset':     project.video_offset,
                    'video_spdup':      project.video_spdup,
                    'frame_number':     project.video.frame_count,
                    
                    'max_samples':      project.max_samples,
                    'max_bg_markers':   project.max_bg_markers,
                    'pred_clear_range': project.pred_clear_range,
                    'marker_snap_range':project.marker_snap_range,

                    'buffer_rate':      project.buffer_rate,
                    'play_speed':       project.play_speed,
                    'max_play_speed':   project.max_play_speed,
                    'refresh_rate':     project.refresh_rate,
                    'signal_zoom':      project.signal_zoom,
                    'min_zoom':         project.min_zoom,
                    
                    'time_cur':         project.time_cur,
                    'target_seconds':   project.target_seconds,

                    'log_settings':     project.log_settings,
                    'modus':            project.modus,
                    }
        return data2JSON(dict_obj)


#########
# Pages #
#########

@app.route("/settings")
def view_settings():
    return render_template("index.html", page="Settings", modus=project.modus)

@app.route("/logging")
def view_logging():
    return render_template("index.html", page="Logging", modus=project.modus)


##############
# Main Route #
##############

@app.route('/resume', methods=['GET', 'POST'])
def enter_name():
    if request.method == 'POST':
        project_name = request.form['project_name']
        if project.set_project_name(project_name):
            return redirect(url_for('index'))

    return render_template('enter_name.html')

@app.route('/', methods=['GET', 'POST'])
def index():
    print("request:",request)
    print(request.form)

    if request.method == 'POST':

        if 'load_video' in request.form:
            return redirect(url_for('upload_video'))

    elif request.method == 'GET':

        if project.project_name == None:
            return redirect(url_for('enter_name'))
        else:
            return render_template('index.html', page="Tool", modus=project.modus)

if __name__ == '__main__':
    defaults_project = get_default_args(Project.__init__)

    parser = argparse.ArgumentParser(description='Set project settings.')
    parser.add_argument('--name',               type=str,   default=defaults_project['project_name'],       help="Name of the project file (required)")

    parser.add_argument('--video_path',         type=str,   default=defaults_project['video_path'],         help='Path of the video file.')

    parser.add_argument('--video_offset',       type=float, default=defaults_project['video_offset'],       help='Offset between video and signal.')
    parser.add_argument('--offset_path',        type=str,   default=defaults_project['offset_path'],        help='Path to the offset file.')
    
    parser.add_argument('--video_spdup',        type=float, default=defaults_project['video_spdup'],        help='Speed up factor of the video file.')
    parser.add_argument('--spdup_path',         type=str,   default=defaults_project['spdup_path'],         help='Path to the video speed file.')

    parser.add_argument('--video_opacity',      type=float, default=defaults_project['video_opacity'],      help='Opacity of the video frame (0=transparent).')
    
    parser.add_argument('--signal_path',        type=str,   default=defaults_project['signal_path'],        help='Path of the signal file.')
    parser.add_argument('--sample_rate',        type=float, default=defaults_project['sample_rate'],        help='Sample rate (in Hz) of the sensor signal.')

    parser.add_argument('--pred_name',          type=str,   default=defaults_project['pred_name'],          help='Name of the prediction file in the upload folder.')
    parser.add_argument('--pred_path',          type=str,   default=defaults_project['pred_path'],          help='Path to the prediction file \'Label.txt\'.')
    parser.add_argument('--label_path',         type=str,   default=defaults_project['label_path'],         help='Path to the label file \'Label.txt\'.')

    parser.add_argument('--max_samples',        type=int,   default=defaults_project['max_samples'],        help='How many samples are drawn on a signal screen.')
    parser.add_argument('--max_bg_markers',     type=int,   default=defaults_project['max_bg_markers'],     help='How many vertical sample indicators are displayed on a signal screen.')
    parser.add_argument('--pred_clear_range',   type=int,   default=defaults_project['pred_clear_range'],   help='Sample tolerance to remove predictions around placed annotations.')
    parser.add_argument('--marker_snap_range',  type=float, default=defaults_project['marker_snap_range'],  help='Range of pixel left and right of marker which register mouse clicks.')

    parser.add_argument('--buffer_rate',        type=float, default=defaults_project['buffer_rate'],        help='Ratio of sensor signal screen window stored in buffer.')
    parser.add_argument('--refresh_rate',       type=float, default=defaults_project['refresh_rate'],       help='Refreshs per second.')
    
    parser.add_argument('--play_speed',         type=float, default=defaults_project['play_speed'],         help='Initial playback speed in frames per second.')
    parser.add_argument('--max_play_speed',     type=float, default=defaults_project['max_play_speed'],     help='Maximum FPS for playback.')

    parser.add_argument('--signal_zoom',        type=float, default=defaults_project['signal_zoom'],        help='Initial zoom lvl (ratio of one frame displayed).')
    parser.add_argument('--min_zoom',           type=float, default=defaults_project['min_zoom'],           help='Minimum zoom lvl.')
    
    parser.add_argument('--time_cur',           type=int,   default=defaults_project['time_cur'],           help='Current project time (in seconds).')
    parser.add_argument('--time_run',           type=int,   default=defaults_project['time_run'],           help='Set timer for the project (in seconds).')
    
    parser.add_argument('--scenario_0',         type=str,   default='test',                                 help='Tutorial Scenario: ID for SHL folder or either \'test\' or \'test_shl\'.')
    parser.add_argument('--scenario_A',         type=str,   default='test',                                 help='Scenario A: ID for SHL folder or either \'test\' or \'test_shl\'.')
    parser.add_argument('--scenario_B',         type=str,   default='test',                                 help='Scenario B: ID for SHL folder or either \'test\' or \'test_shl\'.')

    parser.add_argument('--debug',              action="store_true",                                        help='Enter debug mode.')
    parser.add_argument('--clear',              action="store_true",                                        help='Clear current project settings + prediction history.')
    parser.add_argument('--hide_settings',      action="store_true",                                        help='Hide access to settings menu.')
    parser.add_argument('--restrict_labels',    action="store_true",                                        help='Prevent the user from entering new class labels.')
    parser.add_argument('--study',              action="store_true",                                        help='Set up user study.')
    parser.add_argument('--AI',                 action="store_true",                                        help='Activate AI support. For study set true to start with AI.')
    parser.add_argument('--absolute_paths',     action="store_true",                                        help='Paths are absolute.')
    parser.add_argument('--close_button',       action="store_true",                                        help='Show tab to close the project.')
    parser.add_argument('--no_label',           action="store_true",                                        help='Suppress the loading of label files.')
    parser.add_argument('--label_as_pred',      action="store_true",                                        help='Load label file as prediction.')

    # Dataset specific
    parser.add_argument('--shl_path',           type=str,   default=None,                                   help='Path to the files for SHL dataset complete user 1.')
    
    args = parser.parse_args()
    project = get_project(args)

    app.run(host="0.0.0.0",port=5050,debug=args.debug,use_reloader=False)