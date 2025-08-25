from flask import Flask, render_template, request, redirect, url_for, session, jsonify
import os, base64, io, time
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

# ==================== Routes ====================

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

# About (you link this from camera.html)
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

    # ---- decode base64 -> save captured.png (LOSSLESS) ----
    header, encoded = data_url.split(",", 1)
    image_bytes = base64.b64decode(encoded)

    img = Image.open(io.BytesIO(image_bytes))
    # Normalize mode so PNG saves correctly
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGB")

    tmp_path = "captured.png"
    # optimize=True keeps lossless but reduces metadata where possible
    img.save(tmp_path, format="PNG", optimize=True)

    # ---- detect via ORB (use the saved PNG) ----
    result = detect_logo_orb(tmp_path, logos, orb)  # returns (label, matches) or ("This is not a valid logo", 0)

    # ---- upload to Cloudinary as PNG (keeps best quality) ----
    up = cloudinary.uploader.upload(
        tmp_path,
        folder="logo_detections",
        resource_type="image",
        format="png"  # ensure stored/delivered as PNG
    )
    image_url = up.get("secure_url", "")

    # ---- response for script.js ----
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
        max_results=100
    )
    resources = res.get("resources", [])

    # Extract only URLs + timestamps (and public_id if you need)
    images = []
    for r in resources:
        images.append({
            "url": r.get("secure_url"),
            "created_at": r.get("created_at"),
            "public_id": r.get("public_id", "")
        })

    # Sort by created_at so latest image comes first
    images = sorted(images, key=lambda x: (x["created_at"] or ""), reverse=True)

    return render_template("images.html", images=images)


@app.route("/delete",methods=["POST"])
def delete_image():
    if "user" not in session:
        return redirect(url_for("login"))
    pid=request.form.get("pid")
    if not pid:
        return "Missing public_id, 400
    try:
        res=cloudinary.uploader.destroy(pid,invalidate=True,resource_type="image")
        if res.get("result")in("ok","not found"):
            return redirect(url_for("images"))
        return f"Delete failde: {res}", 500
    except Exception as e:
        return f"Error deleting: {e}", 500
        
# (Optional) quick Cloudinary ping for debugging on Render
@app.route("/_cld_ping")
def _cld_ping():
    try:
        return cloudinary.api.ping()  # expect {"status":"ok"}
    except Exception as e:
        return {"error": str(e)}, 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
