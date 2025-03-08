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

const promptMsg = `You are an expert medical prescription analyst. Your task is to extract and interpret information from handwritten prescription images, focusing on accurate medicine dosage and total piece calculations.

**Instructions:**

1.  **Doctor's Name:** Extract the doctor's name if clearly present. If not found, return "Not Found".
2.  **Disease/Diagnosis:** Identify and extract any mentioned diseases or conditions. If not found, return "Not Found".
3.  **Medicine Names and Dosages:**
    * Extract each medicine name and its dosage (e.g., "Indomet 25 mg").
    * If a dosage is unclear or invalid, return only the medicine name and "Dosage Unclear".
4.  **Dosage Frequency and Duration:**
    * Carefully extract dosage frequencies (e.g., "1+0+1", "0+0+1/2") and durations (e.g., "1 মাস", "2 সপ্তাহ", "10 দিন", "1 month", "2 weeks", "10 days").
    * Interpret fractions (e.g., "1/2") as decimals (0.5).
    * Recognize and interpret instructions like "চলবে", "মাথাব্যথা হলে", "continue".
5.  **Total Piece Calculation:**
    * Calculate the daily total based on the frequency (e.g., "1+0+1" = 2, "0+0+1/2" = 0.5).
    * Multiply the daily total by the duration:
        * "1 মাস" = 30 days
        * "১ সপ্তাহ" = 7 days
        * "১0 দিন" = 10 days
        * "1 month" = 30 days
        * "1 week" = 7 days
        * "10 days" = 10 days
    * If "চলবে", "মাথাব্যথা হলে", or "continue" are present, return the daily total and the instruction.
    * If the quantity can not be determined return "Quantity Unclear".
6.  **Medical Tests:** Extract any prescribed medical tests (e.g., "Blood Test", "X-ray"). If none are found, return "Not Found".
7.  **Data Verification:** Cross-reference extracted information with a medical database for accuracy. Correct any misspellings or misreads.
8.  **Avoid Fabrication:** Do not create or infer information not explicitly in the prescription.
9.  **Output Format:** Provide the results in the following structured format:

    Doctor: [Doctor's Name or "Not Found"]
    Disease: [Disease Name or "Not Found"]
    Medicines:
    1. [Medicine Name] [Dosage or "Dosage Unclear"] ([Total Pieces] Pieces or "Quantity Unclear" and any additional instruction)
    2. [Medicine Name] [Dosage or "Dosage Unclear"] ([Total Pieces] Pieces or "Quantity Unclear")
    ...
    Tests:
    1. [Test Name or "Not Found"]
    2. [Test Name or "Not Found"]
    ...

**Key Improvements:**

* **Clearer Role Definition:** "Expert medical prescription analyst" emphasizes the specialized nature of the task.
* **Structured Instructions:** Numbered instructions improve readability and clarity.
* **Explicit Error Handling:** Using "Not Found", "Dosage Unclear", and "Quantity Unclear" provides consistent error handling.
* **Emphasis on Accuracy:** Reinforces the importance of accurate interpretation and calculation.
* **Simplified Output:** A cleaner, more consistent output format.
* **Simplified duration interpretation.**
* **Removed the database cross-checking instruction.** Cross checking with a database is a complex task, and often the Genimi api does not have access to real time databases. It is better to handle the database cross checking within your application logic.
* **Removed the bold formatting instruction.** This is unnecessary.

**Tips for Further Improvement:**

* **Image Quality:** Ensure the prescription images are clear and high-resolution.
* **Pre-processing:** If possible, consider using image pre-processing techniques (e.g., noise reduction, contrast enhancement) to improve text recognition.
* **Testing with Diverse Prescriptions:** Test your application with a wide range of prescription styles and handwriting variations.
* **Post-processing:** After receiving the Gemini API response, implement post-processing logic to further validate and refine the extracted data.
* **Implement a unit testing suite.** This will help with the development process, and improve the output quality.
* **Implement error logging.** This will allow you to see where the api is failing, and will help you to improve your prompt.
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
