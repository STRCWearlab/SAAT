import json
import numpy as np
import os

from py_code.utils import downsample, fig_to_img, read_csv_file

NAMES_X = ["Time","Acc X","Acc Y","Acc Z",
           "Gyroscope X","Gyroscope Y","Gyroscope Z",
           "Magnetometer X","Magnetometer Y","Magnetometer Z",
           "Orientation W","Orientation X","Orientation Y","Orientation Z",
           "Gravity X","Gravity Y","Gravity Z",
           "Linear acceleration X","Linear acceleration Y","Linear acceleration Z",
           "Pressure","Altitude","Temperature"]


class Signal:
    def __init__(self,
                    path:str,
                    channels:list = ['Acc X', 'Acc Y', 'Acc Z'],
                    normalize:bool = True,
                    flip:bool = True,
                    drop_gravity_channel:str = None,  # Rather normalise than drop gravity
                    ):
        self.path = path

        self.channels = set(channels)

        self.signal_df = None
        self.signal = None

        if self.path is not None:

            print("Source:",self.path)
            self.signal_df = read_csv_file(self.path,names=NAMES_X)

            if self.signal_df is None:
                print("Dataframe is None")
                return

            self.signal = self.signal_df.copy()

            # Select channels
            self.signal = self.signal[channels]

            # Remove gravity
            if drop_gravity_channel is not None and drop_gravity_channel in self.signal.columns:
                self.signal[drop_gravity_channel] = self.signal[drop_gravity_channel].sub(9.81)

            if normalize:
                # Center at 0
                self.signal = self.signal - self.signal.mean()

                # Limit scale to -1/1
                self.signal = self.signal / self.signal.abs().max()

                if flip:
                    # Flip the signal and scale between 0.1 and 0.9 for display
                    self.signal = (1.1 - self.signal) * 0.45

            # Fill NaN values
            self.signal.fillna(0,inplace=True)

            # Convert to numpy
            self.signal = self.signal.to_numpy()

        # ADD DEFAULT HANDLING

        self.ylim = (np.min(self.signal), np.max(self.signal))

        print(f"Set up Signal {self.name}: {channels=} {normalize=} {flip=} {drop_gravity_channel=}")

    @property
    def name(self):
        return self.path.split('/')[-1]
    
    @property
    def length(self):
        return self.signal.shape[0] if self.signal is not None else 0

    def __len__(self):
        return self.length

    def get_data_window_json(self, start:int, stop:int, samples:int=None):
        win = self.get_data_window(start,stop)
        # Perform downsampling if required
        if samples is not None and samples < (stop-start):
            print(f"Downsampling from {stop-start} to { samples}")
            print(f"Before: {win.shape}")
            win = downsample(signal=win, length=samples)
            print(f" After: {win.shape}")
        dic = {chl_name: json.dumps(win[:,i].tolist()) for i,chl_name in enumerate(self.channels)}
        return dic

    def get_data_window(self, start:int, stop:int):
        return self.signal[start:stop]