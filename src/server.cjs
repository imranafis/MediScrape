const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");

// Initialize Google Generative AI
const apiKey = "AIzaSyD3gqq1uwMeun7Uejn_qLLBXeGso18wDjA"; // Replace with your actual API key
const genAI = new GoogleGenerativeAI(apiKey);
const fileManager = new GoogleAIFileManager(apiKey);

// Express app setup
const app = express();
const port = 5000;

app.use(
  cors({
    origin: "https://imranafis.github.io", // Update frontend URL
    methods: ["POST"],
  })
);

const upload = multer({ dest: "uploads/" });

async function uploadToGemini(filePath, mimeType) {
  try {
    const uploadResult = await fileManager.uploadFile(filePath, {
      mimeType,
      displayName: path.basename(filePath),
    });
    return uploadResult.file;
  } catch (error) {
    console.error("Error uploading file to Gemini:", error);
    throw error;
  }
}

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
});

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

const promptMsg = `You are an intelligent assistant specializing in extracting information from handwritten prescription images. Your task is to:

Extract the required data from the uploaded handwritten prescription image and structure the output as follows:  

### 1. Extract Doctor's Name:  
- Identify and extract the doctor's name from the prescription.  

### 2. Extract Disease/Diagnosis Name:  
- Identify any mentioned diseases or conditions (e.g., "Diabetes", "Hypertension", "Asthma").  
- If no disease is found, return "Not Found".  

### 3. Extract and Validate Medicines:  
For each medicine, extract:  
1. **Medicine Name** (Ensure correct spelling and cross-check against known databases).  
2. **Dosage** in the format '<Medicine Name> <Number> mg' (or other valid units).  
3. **Daily Dosage Frequency** (e.g., "1+0+1", "0+0+1", "1+1+1").  
4. **Duration** (e.g., "10 days", "1 month").  
5. **Total Pieces Calculation:**  
   - Multiply the daily total by the duration:  
     - "1+0+1" → **2 pieces/day**  
     - "0+0+1" → **1 piece/day**  
     - "1+1+1" → **3 pieces/day**  
   - Interpret fractional doses correctly (e.g., "1/2" = "0.5").  
   - Convert durations:  
     - "1 month" = **30 days**  
     - "1 week" = **7 days**  
     - "10 days" = **10 days**  
   - If no duration is given, assume **1 month (30 days)**.  
   - If dosage or quantity cannot be determined, return "Quantity Not Found".  

### 4. Extract Medical Tests:  
- Identify any prescribed tests (e.g., "Blood Test", "X-ray", "MRI").  
- If no test is found, return "Not Found".  

### 5. Output Format:  

Doctor's Name:  
[Doctor's Name]  

Disease Name:  
[Disease Name] / Not Found  

Validated Medicines:  
1. [Medicine Name] [Dosage] ([Total Pieces] Pieces)  
2. [Medicine Name] [Dosage] ([Total Pieces] Pieces)  
3. [Medicine Name] [Dosage] (Quantity Not Found)  

Prescribed Tests:  
1. [Test Name] / Not Found  

### 6. Accuracy Requirements:  
- Cross-check medicine names for spelling errors.  
- Ensure correct dosage validation.  
- Correct total piece calculations using proper multiplication.  
- Avoid fabrication—extract only what is explicitly present.  

Guidelines:
- Ensure accuracy by carefully checking for discrepancies in spelling or validity.
- Perform all calculations directly within the response.
- **Pay very close attention to fractions and dosage frequencies, ensuring all variations of 1/2 are handled.**
- Only output the verified information and nothing else.
- Please do not give output results in bold, and if something is missing, return "Not Found".
`;

app.post("/MediScrape", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const uploadedFile = await uploadToGemini(req.file.path, req.file.mimetype);

    const chatSession = model.startChat({
      generationConfig,
      history: [
        {
          role: "user",
          parts: [
            { fileData: { fileUri: uploadedFile.uri } },
            { text: promptMsg },
          ],
        },
      ],
    });
    const result = await chatSession.sendMessage(
      "Analyze the uploaded image and extract doctor's name, disease, medicines, and tests. Perform all dosage calculations."
    );
    const responseText = result.response.text();

    const doctorMatch = responseText.match(/Doctor:\s*(.*)/);
    const doctorName = doctorMatch ? doctorMatch[1].trim() : "Not Found";

    const diseaseMatch = responseText.match(/Disease:\s*(.*)/);
    const disease = diseaseMatch ? diseaseMatch[1].trim() : "Not Found";

    const medicines =
      responseText
        .split("Medicines:")[1]
        ?.split("Tests:")[0]
        ?.trim()
        .split("\n")
        .filter((line) => /^\d+\.\s/.test(line))
        .map((line) => line.replace(/^\d+\.\s*/, "").trim()) || [];

    const tests =
      responseText
        .split("Tests:")[1]
        ?.trim()
        .split("\n")
        .filter((line) => /^\d+\.\s/.test(line))
        .map((line) => line.replace(/^\d+\.\s*/, "").trim()) || [];

    fs.unlinkSync(req.file.path);

    res.json({ doctorName, disease, medicines, tests });
  } catch (error) {
    console.error("Error processing the image:", error);
    res.status(500).json({ error: "Failed to process the image." });
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
