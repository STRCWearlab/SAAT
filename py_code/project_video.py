import cv2
import numpy as np
import os

# generate frame by frame from video
def gen_frames(video,opacity=1.0):
    while True:
        success, frame = video.read()
        if not success:
            break
        else:
            if opacity<1.0:
                white = frame.copy()
                white.fill(255)
                frame = cv2.addWeighted(frame, opacity, white, 1-opacity, 0.0)
            ret, buffer = cv2.imencode('.jpg', frame)
            frame = buffer.tobytes()
            yield frame

class Video:
    def __init__(self,path:str,opacity:float):
        self.path = path
        self.opacity = min(max(opacity,0.0),1.0)
        self.set_video()

    @property
    def name(self):
        return self.path.split('/')[-1]

    def set_video(self):
        self.video = None
        if self.path is not None:
            print(f"Open path {self.path}")
            self.video = cv2.VideoCapture(self.path)
        else:
            print("ERROR: can't open video",self.path)

        if self.video is None:
            self.active = False
            self.width = 1024
            self.height = 768
            self.fps = 0
            self.frame_count = 0
            self.lst_frames = []

        else:
            self.active = True
            self.width = int(self.video.get(cv2.CAP_PROP_FRAME_WIDTH))
            self.height = int(self.video.get(cv2.CAP_PROP_FRAME_HEIGHT))
            self.FPS = self.video.get(cv2.CAP_PROP_FPS)
            self.frame_count = int(self.video.get(cv2.CAP_PROP_FRAME_COUNT))
            self.lst_frames = list(gen_frames(self.video,self.opacity))

        print(f"Initialised Video {self.name}: {self.width}x{self.height} {self.FPS} fps {self.frame_count} frames.")

        array = np.empty((self.height,self.width,4), dtype=np.uint8)
        array.fill(255)
        ret, frame = cv2.imencode('.jpg', array)
        self.clear_frame = frame.tobytes()


    def get_idx_frame(self,idx):
        if idx < 0 or idx >= len(self.lst_frames):
            return self.clear_frame
        else:
            return self.lst_frames[idx]

    def get_frame(self,frame):
        return (b'--frame\r\nContent-Type: image/jpeg\r\n\r\n' + self.get_idx_frame(frame) + b'\r\n')

    def __len__(self):
        return len(self.lst_frames)
