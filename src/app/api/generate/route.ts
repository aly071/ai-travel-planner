import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are a travel planner AI.
Return JSON only. No markdown, no explanation.

Rules:
- Each day must have 3-6 activities
- Include at least 1 restaurant and 1 activity per day
- Coordinates must be real and accurate
- Return valid JSON only, nothing else

Schema:
{
  "trip_name": "string",
  "destination": "string",
  "start_date": "YYYY-MM-DD",
  "end_date": "YYYY-MM-DD",
  "days": [
    {
      "day_number": 1,
      "date": "YYYY-MM-DD",
      "activities": [
        {
          "name": "string",
          "type": "hotel | restaurant | activity | transport",
          "address": "string",
          "latitude": 0,
          "longitude": 0,
          "start_time": "HH:MM",
          "end_time": "HH:MM",
          "estimated_cost": 0,
          "notes": "string"
        }
      ]
    }
  ]
}`;

// Max days per single API call to avoid token limits
const MAX_DAYS_PER_CHUNK = 4;

function getDatesInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);
  while (current <= end) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

async function generateChunk(
  destination: string,
  budget: string,
  interests: string,
  travelerInfo: string,
  chunkDates: string[],
  startDayNumber: number
): Promise<any[]> {
  const chunkStart = chunkDates[0];
  const chunkEnd = chunkDates[chunkDates.length - 1];

  const prompt = `${SYSTEM_PROMPT}

Destination: ${destination}
Dates: ${chunkStart} to ${chunkEnd}
Start at Day ${startDayNumber}
Budget per day: $${Math.round(parseInt(budget) / Math.max(1, chunkDates.length))}
Interests: ${interests}
Traveler: ${travelerInfo || "none"}

Generate ONLY days ${startDayNumber} to ${startDayNumber + chunkDates.length - 1}.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8000,
        },
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(JSON.stringify(data?.error || "Gemini API error"));
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini");

  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd = cleaned.lastIndexOf("}") + 1;
  if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON found in response");

  const parsed = JSON.parse(cleaned.slice(jsonStart, jsonEnd));
  return parsed.days || [];
}

export async function POST(req: NextRequest) {
  try {
    const { destination, startDate, endDate, budget, interests, travelerInfo } =
      await req.json();

    const allDatesRaw = getDatesInRange(startDate, endDate);
    const allDates = allDatesRaw.slice(0, 3); // max 3 days
    const totalDays = allDates.length;

    // Split into chunks if trip is longer than MAX_DAYS_PER_CHUNK
    const chunks: string[][] = [];
    for (let i = 0; i < allDates.length; i += MAX_DAYS_PER_CHUNK) {
      chunks.push(allDates.slice(i, i + MAX_DAYS_PER_CHUNK));
    }

    const allDays: any[] = [];
    let dayNumber = 1;

    for (const chunk of chunks) {
      const days = await generateChunk(
        destination,
        budget,
        interests,
        travelerInfo,
        chunk,
        dayNumber
      );
      allDays.push(...days);
      dayNumber += chunk.length;
    }

    const trip = {
      trip_name: `${destination} Adventure`,
      destination,
      start_date: startDate,
      end_date: endDate,
      days: allDays,
    };

    return NextResponse.json(trip);
  } catch (error: any) {
    console.error("Server error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}