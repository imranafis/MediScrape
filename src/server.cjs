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
const promptMsg = `You are an intelligent assistant specializing in extracting information from handwritten prescription images and calculating the total number of medicine pieces. Your task is to:

1. **Extract Doctor's Name:** Identify and extract the name of the doctor if it is present and clearly mentioned on the prescription.
2. **Extract Medicine Names:** Precisely extract text from the uploaded handwritten prescription image, focusing only on medicine names.
3. **Extract Medical Tests:** Identify any medical tests prescribed in the prescription (e.g., "Blood Test", "X-ray", "MRI", "CBC").
4. **Extract Disease/Diagnosis Names:** Identify any disease or condition mentioned in the prescription (e.g., "Diabetes", "Hypertension", "Asthma").
5. **Verify Against Medical Databases:** Cross-check each extracted name (medicine, test, disease) against a reliable database for accuracy.
6. **Correct Misspellings and Misreads:** Identify and correct any errors caused by handwriting issues.
7. **Avoid Fabrication:** Do not infer or fabricate any names or information not explicitly visible in the prescription.
8. **Extract Dosage Information:** Extract medicine names with dosage values in the format **"<Medicine Name> <Number> mg"** and validate correctness.
9. **Extract All Relevant Medicine Details:**
    - Medicine name
    - Dosage (mg, ml, or other units)
    - Dosage frequency per day (e.g., "1+0+1", "১+০+১")
    - Duration (e.g., "10 days", "১ মাস", "2 weeks", "as needed")
    - Any additional instructions (e.g., "when necessary", "continue")

10. **Calculate Total Medicine Pieces:**
    - If the dosage includes frequencies like:
      - "1+0+0" → **1 doses per day**
      - "১+০+০" → **1 doses per day**
      - "0+1+0" → **1 doses per day**
      - "০+১+০" → **1 doses per day**
      - "0+0+1" → **1 doses per day**
      - "০+০+১" → **1 doses per day**
      - "1+0+1" → **2 doses per day**
      - "১+০+১" → **2 doses per day**
      - "০+০+১/২" → **0.5 doses per day**
      - "0+0+1/2" → **0.5 doses per day**
      - "1+1+1" → **3 doses per day**
      - "১+১+১" → **3 doses per day**
    - Convert fractions (e.g., "1/2") to decimals (0.5).
    - Multiply the daily dosage total by the prescribed **duration**:
      - "1 মাস" = **30 days**
      - "1 সপ্তাহ" = **7 days**
      - "১০ দিন" = **10 days**
      - "১৫ দিন" = **15 days**
    - If duration is not mentioned but words like **"চলবে" (continue), "as needed", "when required"** appear, include **only the daily dosage total with the instruction**.
    - If quantity cannot be determined, indicate **"Quantity Not Found"**.

11. **Output Format:**
    Provide structured output in the following format:

    Doctor: [Doctor's Name]
    Disease: [Disease Name]
    Medicines:
    1. [Medicine Name] [Dosage] mg (**[Total Pieces] Pieces**, [Additional Instruction if any])]
    2. [Medicine Name] [Dosage] mg (**[Total Pieces] Pieces**)]
    3. [Medicine Name] [Dosage] mg (**[Total Pieces] Pieces**, Continue)]
    4. [Medicine Name] [Dosage] mg (**Quantity Not Found**)]
    
    Tests:
    1. [Test Name]

**Guidelines:**
- Ensure accuracy by checking for discrepancies in spelling and validity.
- Perform all calculations directly within the response.
- Pay close attention to **fractions, dosage frequencies, and duration conversions**.
- Do not include any unnecessary information, formatting, or bold text.
- If any data is missing, return **"Not Found"** instead of error messages.
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
