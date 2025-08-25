/* ================== GLOBALS ================== */
let provider = null;
let signer = null;
let contract = null; // keep if you still wire a contract later

// If you still need your ABI/contractAddress, paste them back here:
// const contractAddress = "0x...";
// const contractAbi = [ /* ... */ ];

/* ================== WALLET (optional) ================== */
async function connectWallet() {
  try {
    if (typeof window.ethereum === "undefined") {
      alert("🦊 Metamask not found. Install it first.");
      return;
    }
    provider = new ethers.BrowserProvider(window.ethereum, "any");
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();

    // If you still use a contract:
    // contract = new ethers.Contract(contractAddress, contractAbi, signer);
    alert("✅ Wallet connected!");
  } catch (err) {
    console.error("Wallet connection error:", err);
    alert("❌ Wallet connection failed: " + err.message);
  }
}

/* ================== DETECTION HELPERS ================== */
async function sendToPredict(dataURL) {
  try {
    const res = await fetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataURL }) // Flask expects {image:'data:image/...base64,...'}
    });
    const data = await res.json();

    // Show message on page
    const resultEl = document.getElementById("result");
    if (resultEl) resultEl.innerText = data.message || "";

    // Show returned image (Cloudinary URL)
    if (data.image_url) {
      const imgEl = document.getElementById("captured_image");
      if (imgEl) {
        imgEl.style.display = "block";
        imgEl.src = data.image_url;
      }
    }

    // Optional: if you still record on-chain when valid
    // if (data.valid && contract) {
    //   try {
    //     const tx = await contract.recordDetection(data.logoName || "");
    //     await tx.wait();
    //     alert("✅ Detection recorded on-chain");
    //   } catch (e) {
    //     console.error("Blockchain error:", e);
    //     alert("⚠️ Blockchain error: " + e.message);
    //   }
    // }
  } catch (e) {
    console.error("Predict failed:", e);
    alert("❌ Detection failed: " + e.message);
  }
}

/* ================== CAMERA ================== */
async function startCamera() {
  const video = document.getElementById("video");
  const zoomSlider = document.getElementById("zoomSlider");
  if (!video) return;

  // Request the highest practical resolution from the device
  const constraints = {
    audio: false,
    video: {
      facingMode: (navigator.userAgent.toLowerCase().includes("iphone") || navigator.userAgent.toLowerCase().includes("ipad"))
        ? "user"        // iOS often flips; you can change to 'environment' if you prefer
        : { ideal: "environment" }, // back camera on phones, front on PC
      width:  { ideal: 1920 },
      height: { ideal: 1080 }
    }
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();

    // Zoom support (where available)
    if (zoomSlider && stream.getVideoTracks().length) {
      const [track] = stream.getVideoTracks();
      const caps = track.getCapabilities ? track.getCapabilities() : {};
      if (caps.zoom !== undefined) {
        const step = caps.zoom && caps.zoom.step ? caps.zoom.step : 0.1;
        zoomSlider.min = caps.zoom.min || 1;
        zoomSlider.max = caps.zoom.max || 3;
        zoomSlider.step = step;
        zoomSlider.value = Math.min(zoomSlider.max, Math.max(zoomSlider.min, 1));
        zoomSlider.style.display = "inline";

        zoomSlider.addEventListener("input", async () => {
          try {
            await track.applyConstraints({ advanced: [{ zoom: Number(zoomSlider.value) }] });
          } catch (err) {
            console.warn("Zoom apply error:", err);
          }
        });
      } else {
        zoomSlider.style.display = "none";
      }
    }
  } catch (err) {
    console.error("Could not access camera:", err);
    alert("❌ Could not access camera: " + err.message);
  }
}

// Capture current video frame at full native resolution and send as PNG
async function detectLogo() {
  const video = document.getElementById("video");
  if (!video) {
    alert("Video element not found on page.");
    return;
  }

  // Use the video’s native dimensions
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);

  // IMPORTANT: export as PNG (lossless, better for clarity)
  const dataURL = canvas.toDataURL("image/png"); // <-- changed from image/jpeg
  await sendToPredict(dataURL);
}

/* ================== FILE UPLOAD -> DETECT ================== */
function initUploadAndSend() {
  const uploadBtn = document.getElementById("uploadbtn");
  const fileInput = document.getElementById("fileInput");
  if (!uploadBtn || !fileInput) return;

  uploadBtn.addEventListener("click", () => {
    if (!fileInput.files || !fileInput.files[0]) {
      alert("Please choose an image first.");
      return;
    }
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = async (e) => {
      // We will accept whatever data URL the browser generates (png/jpg)
      // If you want to force PNG upload even from file, we could draw it
      // on a canvas and export as PNG. Uncomment below to force PNG:

      // const img = new Image();
      // img.onload = async () => {
      //   const c = document.createElement("canvas");
      //   c.width = img.naturalWidth;
      //   c.height = img.naturalHeight;
      //   const cx = c.getContext("2d");
      //   cx.drawImage(img, 0, 0);
      //   const pngDataURL = c.toDataURL("image/png");
      //   await sendToPredict(pngDataURL);
      // };
      // img.src = e.target.result;

      // Default: send the data URL as is
      await sendToPredict(e.target.result);
    };
    reader.readAsDataURL(file);
  });
}

/* ================== VIEW MY DETECTIONS ================== */
async function viewDetections() {
  // server shows latest hero + grid
  window.location.href = "/images";
}

/* ================== BIND BUTTONS TO WINDOW (for inline HTML onclick) ================== */
window.connectWallet = connectWallet;
window.detectLogo = detectLogo;
window.viewDetections = viewDetections;

/* If you call these by id from HTML instead of inline onclick */
window.addEventListener("DOMContentLoaded", () => {
  startCamera();
  initUploadAndSend();

  const connectBtn = document.getElementById("connectWalletBtn");
  if (connectBtn) connectBtn.addEventListener("click", connectWallet);

  const detectBtn = document.getElementById("detectBtn");
  if (detectBtn) detectBtn.addEventListener("click", detectLogo);

  const viewBtn = document.getElementById("viewDetectionsBtn");
  if (viewBtn) viewBtn.addEventListener("click", viewDetections);
});
