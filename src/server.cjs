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

// Enable CORS for cross-origin requests
app.use(cors({
  origin: 'https://imranafis.github.io', // Replace with your actual frontend URL
  methods: ['POST'],
}));

// Multer setup for file uploads
const upload = multer({ dest: "uploads/" });

// Helper: Upload file to Gemini
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

// Google Generative Model setup
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

// API Endpoint: Analyze Image
app.post("/MediScrape", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  try {
    // Get MIME type from multer
    const mimeType = req.file.mimetype;

    // Upload the image to Gemini
    const uploadedFile = await uploadToGemini(req.file.path, mimeType);

    const promptMsg = `You are an intelligent assistant specializing in extracting information from handwritten prescription images. Your task is to:

                    1. Extract Doctor's Name: Identify and extract the name of the doctor if it is present and clearly mentioned on the prescription.
                    2. Extract Medicine Names: Precisely extract text from the uploaded handwritten prescription image, focusing only on medicine names.
                    3. Verify Against Medicine Databases: Cross-check each extracted name against a comprehensive and up-to-date medicine database to ensure accuracy. If possible search it on Google and see the results, if Google suggest result then return the result.
                    4. Correct Misspellings and Misreads: Identify and correct any errors caused by handwriting issues (e.g., interpreting "Alatocol" as "Alatrol" if "Alatrol" is a verified medicine name).
                    5. Avoid Fabrication: Do not infer or fabricate any names or information not explicitly visible in the prescription.
                    6. Extract the medicine dosage information from the given image, focusing specifically on text containing the medicine name followed by a numerical dosage value (e.g., "Indomet 25 mg"). Ensure the format is <Medicine Name> <Number> mg. Validate the dosage for correctness, and if it is invalid, return only the medicine name without the dosage.
                    7. Output Format: Provide the verified information in the following format:

                        Doctor: [Doctor's Name]
                        Medicines:
                        1. [<Medicine Name> <Number> mg]
                        2. [<Medicine Name>]

                    Guidelines:
                      - Ensure accuracy by carefully checking for discrepancies in spelling or validity.
                      - Only output the verified information and nothing else.`;

    // Start a chat session
    const chatSession = model.startChat({
      generationConfig,
      history: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                fileUri: uploadedFile.uri,
              },
            },
            {
              text: promptMsg,
            },
          ],
        },
      ],
    });

    const result = await chatSession.sendMessage("Analyze the uploaded image and extract doctor's name and medicine names.");
    const responseText = result.response.text();

    // Extract doctor's name and medicines from the response
    const doctorMatch = responseText.match(/Doctor:\s*(.*)/);
    const doctorName = doctorMatch ? doctorMatch[1].trim() : "Not Found";

    const medicines = responseText
      .split("\n")
      .filter((line) => /^\d+\.\s/.test(line))
      .map((line) => line.replace(/^\d+\.\s*/, "").trim());

    // Clean up the uploaded file after processing
    fs.unlinkSync(req.file.path);

    res.json({ doctorName, medicines });
  } catch (error) {
    console.error("Error processing the image:", error);
    res.status(500).json({ error: "Failed to process the image." });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Server is running on : ${port}`);
});
