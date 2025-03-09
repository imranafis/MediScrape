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
  // model: "gemini-1.5-flash",
  model: "gemini-2.0-flash",
});

const generationConfig = {
  temperature: 1,
  topP: 0.95,
  topK: 40,
  maxOutputTokens: 8192,
  responseMimeType: "text/plain",
};

const promptMsg = `You are an intelligent assistant specializing in extracting information from handwritten prescription images and calculating the total number of medicine pieces. To improve accuracy, you have access to an enhanced OCR system trained on medical handwriting and a comprehensive medical knowledge base. Your task is to:

1. Extract Doctor's Name: Identify and extract the name of the doctor if it is present and clearly mentioned on the prescription.
2. Extract Medicine Names: Precisely extract text from the uploaded handwritten prescription image, focusing only on medicine names.
3. Extract Medical Tests: Identify any medical tests prescribed in the prescription (e.g., "Blood Test", "X-ray", "MRI", "CBC").
4. Extract Disease/Diagnosis Names: Identify any disease or condition mentioned in the prescription (e.g., "Diabetes", "Hypertension", "Asthma").
5. Verify Against Medical Databases: Cross-check each extracted name (medicine, test, disease) against your medical knowledge base for accuracy and identify potential abbreviations or symbols.
6. Correct Misspellings and Misreads: Identify and correct any errors caused by handwriting issues.
7. Avoid Fabrication: Do not infer or fabricate any names or information not explicitly visible in the prescription.
8. Extract the medicine dosage information from the given image, focusing specifically on text containing the medicine name followed by a numerical dosage value (e.g., "Indomet 25 mg"). Ensure the format is <Medicine Name> <Number> mg. Validate the dosage for correctness using your knowledge base, and if it is invalid, return only the medicine name without the dosage.
9. Extract all medicine names, their dosages, and the exact quantity as written in the prescription.
10. Calculate the total number of pieces of each medicine based on the dosage instructions:
    - Use your knowledge of common dosage patterns (e.g., "1+0+1", "before meals") to determine daily quantities.
    - Analyze the spatial layout of the prescription to accurately link medicines with their instructions.
    - If a fraction (e.g., "1/2", "1 by 2") is present, treat it as a decimal (e.g., 0.5).
    - If a duration is given (e.g., "১ মাস", "২ সপ্তাহ", "1 month", "2 weeks", "১০ দিন", "10 days"), multiply the daily total by the duration:
        - ১ মাস = 30 days
        - ১ সপ্তাহ = 7 days
        - ১০ দিন = 10 days
    - If no duration is mentioned, carefully examine the prescription for any implicit instructions or standard durations. If no explicit or implicit duration is found, assume a 30-day (1-month) duration and calculate accordingly.
    - If the dosage instructions are unclear or ambiguous, carefully analyze the surrounding text and context to infer the most likely interpretation. If a definitive interpretation is not possible, return "Quantity Not Found".
    - If the quantity cannot be determined, return "Quantity Not Found".
11. Output Format: Provide the verified information in the following format, including the calculated total pieces:

Doctor: [Doctor's Name]
Disease: [Disease Name]
Medicines:
1. [<Medicine Name> <Number> mg (<Total Pieces> Pieces)]
2. [<Medicine Name> <Number> mg (<Total Pieces> Pieces)]
3. [<Medicine Name> <Number> mg (Quantity Not Found)]
Tests:
1. [<Test Name>]

Guidelines:
- Prioritize accuracy in dosage calculation. If the information is ambiguous or unclear, return "Quantity Not Found" instead of providing a potentially inaccurate numerical value.
- Ensure accuracy by carefully checking for discrepancies in spelling or validity using your medical knowledge base.
- Perform all calculations directly within the response.
- Pay close attention to fractions and dosage frequencies.
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
