import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from "next/server";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { reply: "Server error: GEMINI_API_KEY is missing in the environment variables." },
        { status: 500 }
      );
    }

    const { message } = await req.json();

    if (!message) {
      return NextResponse.json(
        { reply: "Message is required." },
        { status: 400 }
      );
    }

    // Configure the model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Define the system prompt / context for Mini Manager
    const systemInstruction = `
      You are the official AI Assistant for "Mini Manager", a life management platform built for the "Build with Gemini XPRIZE" hackathon.
      Mini Manager's core features include:
      - AI Planner: Optimizes daily timetables based on user schedules.
      - Smart Reminders: Natural language understanding for complex reminders.
      - AI Budget Coach: Personalized financial insights from uploaded spending data.
      - Document Reader: Summarizes PDFs instantly.
      - AI Email Writer: Drafts professional emails.
      - Study & Travel Planners: Creates tailored revision timetables and trip itineraries.
      - Voice Commands: Hands-free management.
      - Platform: Available as a Windows desktop application (setup.exe) with a live web demo preview.
      
      Respond to the user's questions in a helpful, concise, and enthusiastic manner. 
      Keep answers relatively short (1-3 sentences) as they are displayed in a small chat widget on the landing page.
      Always promote the Mini Manager app and its Gemini-powered capabilities.
    `;

    // Start a chat session (in a real app, you might want to maintain history, 
    // but for this simple landing page widget, we just respond to the immediate message with context)
    const chat = model.startChat({
      systemInstruction,
    });

    const result = await chat.sendMessage(message);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ reply: text });
  } catch (error) {
    console.error("Error in Gemini API route:", error);
    return NextResponse.json(
      { reply: "I'm having trouble connecting to my brain right now. Please try again later." },
      { status: 500 }
    );
  }
}
