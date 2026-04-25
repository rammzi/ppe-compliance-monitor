# Industrial PPE Dashboard Integration Guide

This dashboard is built with React and Vite. You can run it locally in VS Code to interface with your model.

## 1. Local Setup

1.  **Download the Code**: Export the project files to a folder on your computer.
2.  **Open in VS Code**: Open the folder in VS Code.
3.  **Install Dependencies**:
    Open a terminal in VS Code (`Ctrl+` `) and run:
    ```bash
    npm install
    ```
4.  **Start the Dashboard**:
    ```bash
    npm run dev
    ```
    This will start the local server (usually at `http://localhost:5173`).

## 2. Connecting to a Local Model (Roboflow Inference)

If you are running the model locally (e.g., using the Roboflow Inference Docker container or Python package) instead of the hosted API:

1.  **Create a `.env` file** in the root directory.
2.  **Configure the URL**:
    Add the following line to point to your local inference server (default is usually port 9001):
    ```env
    VITE_ROBOFLOW_BASE_URL=http://localhost:9001
    VITE_ROBOFLOW_API_KEY=your_api_key
    VITE_ROBOFLOW_MODEL_ID=construction-ppe-detection/1
    ```

## 3. Viewing inside VS Code

You can view the running dashboard directly inside VS Code:

1.  Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac).
2.  Type **"Simple Browser: Show"**.
3.  Enter the URL: `http://localhost:5173` (or whatever port `npm run dev` provided).

Now you have your dashboard running side-by-side with your code!
