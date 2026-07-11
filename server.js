import express from 'express';
// Import 'toFile' directly alongside Groq
import Groq, { toFile } from 'groq-sdk'; 
import multer from 'multer';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const app = express();
const upload = multer({ dest: 'uploads/' });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

app.use(express.static('public'));

app.post('/api/summarize-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Please upload an MP3 file." });
    }

    const filePath = req.file.path;

    const fileStream = fs.createReadStream(filePath);
    const virtualFile = await toFile(fileStream, 'audio.mp3');

    // Transcribe via Whisper
    const transcription = await groq.audio.transcriptions.create({
      file: virtualFile, 
      model: "whisper-large-v3",
      response_format: "json",
      prompt: "This audio contains a mix of Sri Lankan English, standard Sinhala speech, and Singlish expressions like kohomada, machan, and ela."
    });

    const rawTranscript = transcription.text;

    // STEP B: Generate Summary Points via Llama 3
    const chatCompletion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are an expert system fluent in English, Sinhala, and Singlish. 
          Read raw transcripts containing mixed English and Singlish, decode the meaning accurately, and output clear, summarized bullet points.
          Rule: Convert Singlish concepts accurately into clear English takeaways. Return ONLY the final bullet points. No introductory text.`
        },
        {
          role: "user",
          content: `Summarize this raw transcript:\n\n${rawTranscript}`
        }
      ],
      temperature: 0.2
    });

    // Clean up temporary local server storage file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      transcript: rawTranscript,
      summary: chatCompletion.choices[0].message.content
    });

  } catch (error) {
    console.error("Pipeline processing error:", error);
    res.status(500).json({ error: "An error occurred while converting audio to summary." });
  }
});

app.listen(3000, () => console.log('Backend server successfully running on port 3000'));