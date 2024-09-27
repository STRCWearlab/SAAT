import json
import numpy as np
from time import sleep
import os
from sortedcontainers import SortedDict

from py_code.utils import read_csv_file

NAMES_Y = ["Time","Coarse","Fine","Road","Traffic","Tunnels","Social","Food"]

LABELS_SHL_Idx2Label = {
        0: "_none_",
        1: "Still",
        2: "Walking",
        3: "Run",
        4: "Bike",
        5: "Car",
        6: "Bus",
        7: "Train",
        8: "Subway",
        }

LABELS_SHL_Label2Idx = { v:k for k,v in LABELS_SHL_Idx2Label.items() }

def get_breakpoints(mat):
    last = mat[0]
    points = {0:last}
    for i,c in enumerate(mat):
        if last != c:
            points[i] = c
            last = c
    return points


def get_label(label,convert_to_label=False,convert_to_idx=False):
    if convert_to_label:
        return LABELS_SHL_Idx2Label[label]
    elif convert_to_idx:
        return LABELS_SHL_Label2Idx[label]
    else:
        return label

class Annotation:
    def __init__(self, type_:str, path_:str, points:dict=None, SHL_label_file:str=None):
        
        self.type = type_
        self.path = path_
        self.clear_anno_dict()

        # 0 = file can be accessed
        # 1 = file is being accessed
        # 2 = file is beign waited on, save again after completion
        self.lock_file = 0

        if self.load_anno_dict():
            print(f"Got {self.type} from saved file.")
        elif points is not None and len(points)>0:
            self.set_anno_dict(points)
            print(f"Got {self.type} from arguments.")

        elif SHL_label_file is not None:
            self.mat_df = read_csv_file(SHL_label_file,names=NAMES_Y)

            if self.mat_df is not None:
                points_ = get_breakpoints(self.mat_df["Coarse"].to_numpy())
                print(points_)
                self.set_anno_dict({k:LABELS_SHL_Idx2Label[v] for k,v in points_.items()})
                print(f"Got {self.type} from Coarse file: {SHL_label_file}")

        

    def load_anno_dict(self):
        if self.path is not None and os.path.exists(self.path):
            with open(self.path) as f:
                try:
                    data = json.load(f)
                except json.decoder.JSONDecodeError as e:
                    print(f"{self.type} - Can't read file {self.path}")
                    return False
                else:
                    for k,v in data.items():
                        self.add_anno(int(k),v,save=False)
            return True
        else:
            return False
                

    def save_anno_dict(self):
        if self.path is None:
            print("No path set.")
            return

        # Check if file is already accessed
        if self.lock_file > 0:
            print(f"Can't access file {self.path}, access is locked")
            self.lock_file = 2
            return

        self.lock_file = 1
        while self.lock_file > 0:
            # Serializing json
            json_object = json.dumps(self.labels, indent=4)
            with open(self.path, "w") as outfile:
                outfile.write(json_object)

            self.lock_file -= 1
            print(f"Saved {self.type} to file {self.path}.")
        

    def get_anno_dict(self, convert_to_label=False, convert_to_idx=False):
        ''' Returns a default unsorted dictionary for JSON serialization '''
        points = {}
        for k,v in self.labels.items():
            points[int(k)] = str(get_label(v,convert_to_label,convert_to_idx))
        return points

    def clear_anno_dict(self):
        self.labels = SortedDict()

    def set_anno_dict(self,points):
        for sample, label in points.items():
            self.labels[int(sample)] = str(label)

    def add_anno(self, sample:int, label, save=True):
        sample = int(sample)
        self.labels[sample] = str(label)
        status = True
        msg = f"{self.type} - added sample: {sample} ({label})"
        print(msg)
        if save:
            self.save_anno_dict()
        return status, msg


    def del_anno(self, sample:int):
        sample = int(sample)
        if sample in self.labels.keys():
            self.labels.pop(sample)
            status = True
            msg = f"{self.type} - removed sample: {sample}"
        else:
            print("annos:",self.labels)
            status = False
            msg = f"{self.type} - can't find sample: {sample}"
        
        print(msg)
        print(status,self.lock_file)
        if status:
            self.save_anno_dict()
        return status, msg

    def get_array(self, last_sample, dtype=int, convert_to_label=False, convert_to_idx=False):
        assert not convert_to_label and convert_to_idx
        arr = np.zeros((last_sample), dtype=dtype)
        label, idx = None, None
        for i,(k,v) in enumerate(self.labels.items()):
            if k>last_sample:
                break
            if label is not None:
                arr[idx:k] = get_label(label,convert_to_label,convert_to_idx)
            label, idx = v,k
        if label is not None:
            arr[idx:last_sample] = get_label(label,convert_to_label,convert_to_idx)
        return arr