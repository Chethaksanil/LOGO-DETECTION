// ---------- GLOBALS ----------
let provider;
let signer;
let contract;

// ====== CONTRACT SETUP ======
const contractAddress = "0xbaf0ad7E1e26A05D70A3f8dC2D971E00705337b4"; // keep yours
const contractABI = [
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true,  "internalType": "address", "name": "user",     "type": "address" },
      { "indexed": false, "internalType": "string",  "name": "logoName", "type": "string"  }
    ],
    "name": "DetectionRecorded",
    "type": "event"
  },
  {
    "inputs": [{ "internalType": "string", "name": "logoName", "type": "string" }],
    "name": "recordDetection",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "", "type": "address" },
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "name": "detections",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getMyDetections",
    "outputs": [{ "internalType": "string[]", "name": "", "type": "string[]" }],
    "stateMutability": "view",
    "type": "function"
  }
];

// ---------- WALLET ----------
async function connectWallet() {
  if (typeof window.ethereum === "undefined") {
    alert("🦊 Enkrypt not found. Install it first.");
    return;
  }
  try {
    provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    await provider.send("eth_requestAccounts", []);
    const accounts = await provider.listAccounts();
    signer = provider.getSigner(accounts[0]);
    contract = new ethers.Contract(contractAddress, contractABI, signer);
    alert("✅ Enkrypt wallet connected!");
  } catch (err) {
    console.error("Connection error:", err);
    alert("❌ Wallet connection failed: " + err.message);
  }
}

// ---------- DETECTION HELPERS ----------
async function sendToPredict(dataURL) {
  try {
    const res = await fetch("/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: dataURL }) // your Flask /predict expects {image: "data:image/...;base64,..."}
    });
    const data = await res.json();

    // Show message on page if #result exists, else alert
    const resultEl = document.getElementById("result");
    if (resultEl) resultEl.innerText = data.message || (data.valid ? "Valid logo" : "This is not a valid logo");
    else alert(data.message || (data.valid ? "Valid logo" : "This is not a valid logo"));

    // Optional preview: if backend returns Cloudinary URL
    if (data.image_url) {
      const img = document.getElementById("resultImage");
      if (img) img.src = data.image_url;
    }

    // Record on-chain if valid and contract is ready
    if (data.valid && data.logoName && contract) {
      try {
        const tx = await contract.recordDetection(data.logoName);
        await tx.wait();
        alert("🧾 Detection recorded on Sepolia!");
      } catch (err) {
        console.error("Blockchain Error:", err);
        alert("❌ Blockchain Error: " + err.message);
      }
    }
  } catch (e) {
    console.error(e);
    alert("❌ Detection failed: " + e.message);
  }
}

// Capture current <video> frame and send
async function captureAndSend() {
  const video = document.getElementById("video");
  if (!video) {
    alert("Video element not found on page.");
    return;
  }
  // Create an offscreen canvas
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imageData = canvas.toDataURL("image/png"); // -> "data:image/jpeg;base64,..."
  await sendToPredict(imageData);
}

// For your existing button that calls detectLogo()
function detectLogo() {
  return captureAndSend();
}

// ---------- FILE UPLOAD (Choose file -> Upload & Detect) ----------
const fileInput = document.getElementById("fileInput");
const uploadBtn = document.getElementById("uploadBtn");

if (uploadBtn) {
  uploadBtn.addEventListener("click", () => {
    const file = fileInput?.files?.[0];
    if (!file) {
      alert("Please choose an image first.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataURL = reader.result; // "data:image/...;base64,..."
      sendToPredict(dataURL);
    };
    reader.readAsDataURL(file);
  });
}

// ---------- CAMERA with ZOOM ----------
function startCamera() {
  const video = document.getElementById("video");
  const zoomSlider = document.getElementById("zoomSlider");
  if (!video) return;

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const constraints = {
    video: isMobile
      ? { facingMode: { exact: "environment" },
         width:{ideal:1280},
         height:{ideal:720},
         aspectRatio:{ideal:1280/720}
        } // back camera on phone
      : { facingMode: "user" ,
         width:{ideal:540},
         height:{ideal:720},
         aspectRatio:{ideal:1280/720}
        }                   // front camera on PC
  };

  navigator.mediaDevices.getUserMedia(constraints)
    .then((stream) => {
      video.srcObject = stream;
      const track = stream.getVideoTracks()[0];
      const capabilities = track.getCapabilities ? track.getCapabilities() : {};
      const settings = track.getSettings ? track.getSettings() : {};

      if (zoomSlider && capabilities.zoom) {
        zoomSlider.min = capabilities.zoom.min;
        zoomSlider.max = capabilities.zoom.max;
        zoomSlider.step = capabilities.zoom.step || 0.1;
        zoomSlider.value = settings.zoom || 1;
        zoomSlider.style.display = "inline";

        zoomSlider.oninput = () => {
          const zoomLevel = parseFloat(zoomSlider.value);
          track.applyConstraints({ advanced: [{ zoom: zoomLevel }] });
        };
      } else if (zoomSlider) {
        zoomSlider.style.display = "none";
        console.warn("Zoom not supported on this device.");
      }
    })
    .catch((err) => {
      console.error("Camera Error:", err);
      alert("❌ Could not access camera: " + err.message);
    });
}
window.onload = startCamera;

// ---------- VIEW MY DETECTIONS (BLOCKCHAIN) ----------
async function getMyDetections() {
  if (!contract) {
    alert("❌ Wallet not connected!");
    return;
  }
  try {
    const detections = await contract.getMyDetections();
    alert("🧾 Your Detections:\n" + detections.join("\n"));
  } catch (err) {
    console.error("Get Detections Error:", err);
    alert("❌ Error getting detections: " + err.message);
  }
}

// Expose functions used by HTML buttons
window.connectWallet = connectWallet;
window.detectLogo = detectLogo;
window.getMyDetections = getMyDetections;
