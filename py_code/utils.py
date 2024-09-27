import functools
import inspect
import io
import json
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from PIL import Image


def combine_dims(a:np.array, i:int=0, n:int=1):
    """
    Combines dimensions of numpy array `a`, 
    starting at index `i`,
    and combining `n` dimensions
    """
    s = list(a.shape)
    combined = functools.reduce(lambda x,y: x*y, s[i:i+n+1])
    return np.reshape(a, s[:i] + [combined] + s[i+n+1:])

def get_default_args(func):
    signature = inspect.signature(func)
    return {
        k: v.default
        for k, v in signature.parameters.items()
        if v.default is not inspect.Parameter.empty
    }

def make_numpy(mat):
    if not isinstance(mat, np.ndarray):
        if isinstance(mat,list):
            return np.array(mat)
        elif isinstance(mat, pd.DataFrame):
            return mat.to_numpy()
        else:
            raise TypeError("Unknown data type: "+str(type(mat)))
    return mat

def read_csv_file(file_path,sep=' ',names=None):
    try:
        df = pd.read_csv(file_path,sep=' ',names=names)
    except FileNotFoundError as e:
        print(e)
        df = None
    return df

def fig_to_img(fig, dpi=100, transparent=True, close=False):
    """Convert a Matplotlib figure to a PIL Image and return it"""
    buf = io.BytesIO()
    fig.savefig(buf, dpi=dpi, transparent=transparent)
    if close:
        plt.close(fig)
    buf.seek(0)
    img = Image.open(buf)
    return img

def downsample(signal, length):
    return signal
    # use linear interpolation
    # endpoint keyword means than linspace doesn't go all the way to 1.0
    # If it did, there are some off-by-one errors
    # e.g. scale=2.0, [1,2,3] should go to [1,1.5,2,2.5,3,3]
    # but with endpoint=True, we get [1,1.4,1.8,2.2,2.6,3]
    # Both are OK, but since resampling will often involve
    # exact ratios (i.e. for 44100 to 22050 or vice versa)
    # using endpoint=False gets less noise in the resampled sound
    resampled_signal = np.interp(
        np.linspace(0.0, 1.0, length, endpoint=False),  # where to interpret
        np.linspace(0.0, 1.0, signal.shape[0], endpoint=False),  # known positions
        signal,  # known data points
    )
    return resampled_signal