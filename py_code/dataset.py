import os

def parse_dataset_arguments(args):
    if args.shl_path is not None:
        args.video_path = os.path.join(args.shl_path,"timelapse.avi")
        args.offset_path = os.path.join(args.shl_path,"videooffset.txt")
        args.spdup_path = os.path.join(args.shl_path,"videospeedup.txt")
        args.signal_path = os.path.join(args.shl_path,"Hips_Motion.txt")
        args.label_path = os.path.join(args.shl_path,"Label.txt")
        args.sample_rate = 100

    if args.label_as_pred:
        args.pred_path = args.label_path
        args.label_path = None

    # Suppress loading of label file if required
    if args.no_label:
        args.label_path = None

    return args