from flask import Flask, render_template, request, redirect, url_for, session, jsonify
import os, base64, io
from PIL import Image
import cloudinary, cloudinary.uploader, cloudinary.api
from dotenv import load_dotenv
from orb_detector import load_logo_features, detect_logo_orb

# --- init ---
load_dotenv()
app = Flask(__name__)
app.secret_key = "logoapp123"

# --- Cloudinary (use .env) ---
cloudinary.config(
    cloud_name=os.getenv("CLOUDINARY_CLOUD_NAME"),
    api_key=os.getenv("CLOUDINARY_API_KEY"),
    api_secret=os.getenv("CLOUDINARY_API_SECRET"),
    secure=True,
)

# --- Simple auth ---
USERNAME = "admin"
PASSWORD = "admin"

# --- ORB features (load once) ---
logos, orb = load_logo_features()

# ===================== Routes =====================

# Home -> Login
@app.route("/")
def home():
    return redirect(url_for("login"))

# Login
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        if request.form.get("username") == USERNAME and request.form.get("password") == PASSWORD:
            session["user"] = USERNAME
            return redirect(url_for("camera"))
        return render_template("login.html", error="Invalid credentials")
    return render_template("login.html")

# Logout
@app.route("/logout")
def logout():
    session.pop("user", None)
    return redirect(url_for("login"))

# About (you link to this from camera.html)
@app.route("/about")
def about():
    return render_template("about.html")

# Camera page (protected)
@app.route("/camera")
def camera():
    if "user" not in session:
        return redirect(url_for("login"))
    return render_template("camera.html")

# Predict (accepts base64 from camera/file, detects, uploads to Cloudinary)
@app.route("/predict", methods=["POST"])
def predict():
    if "user" not in session:
        return redirect(url_for("login"))

    data = request.get_json(silent=True) or {}
    data_url = data.get("image")
    if not data_url or "," not in data_url:
        return jsonify({"message": "No image received", "valid": False}), 400

    # decode base64 -> save captured.jpg
    _, encoded = data_url.split(",", 1)
    image_bytes = base64.b64decode(encoded)
    image = Image.open(io.BytesIO(image_bytes))
    image.save("captured.jpg")

    # detect via ORB
    result = detect_logo_orb("captured.jpg", logos, orb)  # returns (label, matches) or ("This is not a valid logo", 0)

    # upload to Cloudinary
    up = cloudinary.uploader.upload("captured.jpg", folder="logo_detections")
    image_url = up.get("secure_url", "")

    # response for script.js
    if isinstance(result, tuple) and result[0] != "This is not a valid logo":
        return jsonify({
            "message": f"This logo belongs to {result}",
            "valid": True,
            "logoName": result[0],
            "image_url": image_url
        })
    else:
        return jsonify({
            "message": "This is not a valid logo",
            "valid": False,
            "image_url": image_url
        })

# Images gallery (protected)
@app.route("/images")
def images():
    if "user" not in session:
        return redirect(url_for("login"))

    # Fetch resources from Cloudinary
    res = cloudinary.api.resources(
        type="upload",
        prefix="logo_detections/",
        max_results=100,
        resource_type="image"
    )

    resources = res.get("resources", [])

    # Extract only URLs
    images = []
    for r in resources:
        images.append({
            "url": r.get("secure_url"),
            "created_at": r.get("created_at")
        })

    # Sort by created_at so latest image comes first
    images = sorted(images, key=lambda x: x["created_at"], reverse=True)

    return render_template("images.html", images=images)

# ==================================================
@app.route("/cld_ping")
def cld_ping():
    try:
        return cloudinary.api.ping()  # expects {"status":"ok"}
    except Exception as e:
        return str(e), 500
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
