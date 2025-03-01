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

    1. Extract Doctor's Name: Identify and extract the name of the doctor if it is present and clearly mentioned on the prescription.
    2. Extract Medicine Names: Precisely extract text from the uploaded handwritten prescription image, focusing only on medicine names.
    3. Extract Medical Tests: Identify any medical tests prescribed in the prescription (e.g., "Blood Test", "X-ray", "MRI", "CBC").
    4. Extract Disease/Diagnosis Names: Identify any disease or condition mentioned in the prescription (e.g., "Diabetes", "Hypertension", "Asthma").
    5. Verify Against Medical Databases: Cross-check each extracted name (medicine, test, disease) against a reliable database for accuracy.
    6. Correct Misspellings and Misreads: Identify and correct any errors caused by handwriting issues.
    7. Avoid Fabrication: Do not infer or fabricate any names or information not explicitly visible in the prescription.
    8. Extract the medicine dosage information from the given image, focusing specifically on text containing the medicine name followed by a numerical dosage value (e.g., "Indomet 25 mg"). Ensure the format is <Medicine Name> <Number> mg. Validate the dosage for correctness, and if it is invalid, return only the medicine name without the dosage.
    9. Extract all medicine names, their dosages, and the exact quantity as written in the prescription.
        - If dosage instructions and duration are in Bangla, interpret them correctly.
        - Calculate the total number of pieces for each medicine based on the dosage and duration.
        - Handle variations in duration units like "মাস" (month), "সপ্তাহ" (week), "দিন" (day), and other instructions like "চলবে" (continue), "বমি অনুভব করেন" (feel nauseous).
        - If the number of pieces is not directly mentioned, calculate it based on the given dosage and duration.
        - If the duration is not a specific number, and only says "চলবে" or "continue", return the medicine name and dosage only, and write "Continue".
        - If the dosage is "1+0+1" and duration is "১ মাস", the total pieces should be 2 * 30 = 60.
        - If you cannot calculate the total number of pieces, write "Quantity Not Found".
        - If a dosage is written as "1/2" or "½", interpret it as "half" and treat it as 0.5 when calculating total pieces.
        - If any additional instructions are present beside the dosage or duration, include those instructions in the output within parentheses.
        - If the dosage includes "1/2" or "½", and the duration is "১ মাস", calculate the total pieces based on the daily dosage (including the half) multiplied by 30.
        - If the dosage includes "1/2" or "½", and the duration is "১ সপ্তাহ", calculate the total pieces based on the daily dosage (including the half) multiplied by 7.
        - If the dosage includes "1/2" or "½", and the duration is "১ দিন", calculate the total pieces based on the daily dosage (including the half).
        - **If the duration is "1 month", multiply the daily dosage by 30 to get the total number of pieces.**
    10. Output Format: Provide the verified information in the following format:

    Doctor: [Doctor's Name]
    Disease: [Disease Name]
    Medicines:
    1. [<Medicine Name> <Number> mg (<Number> Pieces and any additional instruction)]
    2. [<Medicine Name> <Number> mg (<Number> Pieces Continue)]
    3. [<Medicine Name> <Number> mg (Quantity Not Found)]
    Tests:
    1. [<Test Name>]

    Guidelines:
        - Ensure accuracy by carefully checking for discrepancies in spelling or validity.
        - Only output the verified information and nothing else.
        - Please do not give output results in bold and no error message if something is missing return not found.
        - Perform all calculations and interpretations of Bangla within the response itself. Do not leave any calculations for the client to perform.
        - If the quantity is directly written in the image, use that value. Do not attempt to recalculate.
        - If a medicine has multiple dosages in a day, add those values together to get the daily dosage.
        - If the duration is in মাস, multiply the daily dosage by 30 to get the total quantity.
        - If the duration is in সপ্তাহ, multiply the daily dosage by 7 to get the total quantity.
        - If the duration is in দিন, use that number.
        - If the duration is in month, multiply the daily dosage by 30 to get the total quantity.
        - If the duration is in week, multiply the daily dosage by 7 to get the total quantity.
        - If the duration is in day, use that number.`;

console.log(promptMsg);

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
