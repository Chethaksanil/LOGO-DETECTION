import cv2
import os

def load_logo_features():
    orb = cv2.ORB_create()
    logo_features = {}
    logo_dir = "logo_dataset"

    for folder in os.listdir(logo_dir):
        folder_path = os.path.join(logo_dir, folder)
        if os.path.isdir(folder_path):
            for filename in os.listdir(folder_path):
                if filename.lower().endswith((".png", ".jpg", ".jpeg")):
                    img_path = os.path.join(folder_path, filename)
                    img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
                    if img is None:
                        continue
                    keypoints, descriptors = orb.detectAndCompute(img, None)
                    if descriptors is not None:
                        logo_features[folder.lower()] = descriptors

    return logo_features, orb

def detect_logo_orb(filename, logos, orb):
    frame=cv2.imread(filename)
    if frame is None:
        raise ValueError(f"Could not read image: {filename}")
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    kp_frame, des_frame = orb.detectAndCompute(gray, None)

    if des_frame is None or len(kp_frame) < 10:
        return "This is not a valid logo", 0
    MIN_MATCH_COUNT=20
    bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
    best_label = "This is not a valid logo"
    best_matches = 0

    for label, des_logo in logos.items():
        matches = bf.match(des_logo, des_frame)
        good_matches = [m for m in matches if m.distance < 50]

        if len(good_matches) > best_matches:
            best_matches = len(good_matches)
            best_label = label
    
    if best_matches >=MIN_MATCH_COUNT:
        return best_label, best_matches
    else:
        return "This is not a valid logo", 0
    

