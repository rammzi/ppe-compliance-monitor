from flask import Flask, request, jsonify
from ultralytics import YOLO
import cv2
import numpy as np
import base64

app = Flask(__name__)

# 1. Load your brand new custom brain!
print("Loading Custom YOLOv8 Model...")
model = YOLO('best.pt')

@app.route('/', methods=['GET'])
def health_check():
    return "🚀 AI Engine is ONLINE and ready for inference!"

@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.json
        # Strip the "data:image/jpeg;base64," prefix if it exists
        base64_string = data.get('image', '')
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
            
        conf_threshold = float(data.get('confidence', 0.5))

        # Decode the Base64 image back into pixels
        img_bytes = base64.b64decode(base64_string)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        # Run the AI!
        results = model.predict(img, conf=conf_threshold, verbose=False)

        # Format the output EXACTLY like Roboflow so React doesn't break
        predictions = []
        for box in results[0].boxes:
            # YOLO outputs center x, center y, width, height natively!
            x, y, w, h = box.xywh[0].tolist()
            conf = float(box.conf[0])
            cls_id = int(box.cls[0])
            cls_name = model.names[cls_id]

            predictions.append({
                "x": x,
                "y": y,
                "width": w,
                "height": h,
                "confidence": conf,
                "class": cls_name
            })

        return jsonify({
            "predictions": predictions,
            "image": {"width": img.shape[1], "height": img.shape[0]}
        })

    except Exception as e:
        print(f"Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Run this microservice on port 5000
    app.run(port=5000)