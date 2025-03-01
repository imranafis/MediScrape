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

1. **Extract Doctor's Name:** Identify and extract the name of the doctor if it is present and clearly mentioned on the prescription.
2. **Extract Medicine Names and Dosages:** Accurately extract text from the prescription, focusing on:
   - Medicine names with their respective dosages (e.g., "Indomet 25 mg").
   - The total number of tablets required based on the prescribed dosage and duration.
   - If dosage instructions and duration are in Bangla, interpret them correctly.
3. **Calculate Total Number of Tablets:**
   - If the prescription has a dosage pattern like **"1+0+1"** and duration **"1 মাস"**, calculate as:
     **(1+0+1) * 30 = 60 tablets**.
   - If the duration is **"1 সপ্তাহ"**, calculate as:
     **(1+0+1) * 7 = 14 tablets**.
   - If the duration is **"1 দিন"**, the total pieces should be based on that day's intake.
   - If dosage includes **"1/2" or "½"**, interpret it as **0.5** and calculate accordingly.
   - If the duration is **"চলবে"** or **"continue"**, provide only the medicine name and dosage, with "Continue" in place of total tablets.
   - If the quantity is directly mentioned in the image, use that value instead of recalculating.
4. **Include Additional Instructions:**
   - If there are specific instructions such as **"বমি অনুভব করেন"** (feel nauseous) or **"চলবে"** (continue), include them in parentheses.
   - Example: "Omeprazole 20 mg (2 times a day, চলবে)".
5. **Extract Medical Tests:** Identify any tests prescribed (e.g., "Blood Test", "X-ray", "MRI", "CBC").
6. **Extract Disease/Diagnosis Names:** Identify any diseases or conditions mentioned (e.g., "Diabetes", "Hypertension", "Asthma").
7. **Verify Against Medical Databases:** Cross-check medicine names, tests, and diseases for accuracy.
8. **Correct Misspellings and Misreads:** Identify and correct errors caused by handwriting issues.
9. **Avoid Fabrication:** Do not infer or fabricate names or details not explicitly visible in the prescription.
10. **Output Format:**

Doctor: [Doctor's Name]
Disease: [Disease Name]
Medicines:
1. [Medicine Name Dosage (Total Pieces)]
2. [Medicine Name Dosage (Times per day, Additional Instructions)]
3. [Medicine Name Dosage (Continue)]
4. [Medicine Name Dosage (Quantity Not Found)]

Tests:
1. [Test Name]


**Guidelines:**
- Ensure accuracy by carefully checking for spelling discrepancies.
- Only output verified information and nothing else.
- If something is missing, return "Not Found" without error messages.
- Perform all calculations within the response; do not leave them for the client.
- Convert **Bangla durations** like **"মাস", "সপ্তাহ", "দিন"** into their respective values for correct calculations.
- Ensure that medicine names include the dosage (mg) along with the correct total number of tablets required for purchase.`;

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
      "Analyze the uploaded image and extract doctor's name, disease, medicines, and tests."
    );
    const responseText = result.response.text();

    const doctorMatch = responseText.match(/Doctor:\s*(.*)/);
    const doctorName = doctorMatch ? doctorMatch[1].trim() : "Not Found";

    const diseaseMatch = responseText.match(/Disease:\s*(.*)/);
    const disease = diseaseMatch ? diseaseMatch[1].trim() : "Not Found";

    const medicines = responseText
      .split("Medicines:\n")[1]
      .split("Tests:\n")[0]
      .trim()
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => line.replace(/^\d+\.\s*/, "").trim());

    const testsMatch = responseText.match(/Tests:\s*([\s\S]*)/);
    const tests = testsMatch
      ? testsMatch[1]
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => line.replace(/^\d+\.\s*/, "").trim())
      : [];

    fs.unlinkSync(req.file.path);

    res.json({ doctorName, disease, medicines, tests });
  } catch (error) {
    console.error("Error processing the image:", error);
    res.status(500).json({ error: "Failed to process the image." });
  }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
