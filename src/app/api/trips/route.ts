import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET all trips
export async function GET() {
  try {
    const trips = await db.trip.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(trips);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST save a new trip
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const trip = await db.trip.create({
      data: {
        userId: "guest",
        tripName: body.trip_name,
        destination: body.destination,
        startDate: new Date(body.start_date),
        endDate: new Date(body.end_date),
        totalBudget: parseFloat(body.budget || "0"),
        tripData: body,
      },
    });

    return NextResponse.json(trip, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}