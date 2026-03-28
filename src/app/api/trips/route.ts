import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Get logged in Clerk user
    const { userId: clerkId } = await auth();

    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Find the user in our database
    let user = await db.user.findUnique({
      where: { clerkId },
    });
    
    if (!user) {
      user = await db.user.create({
        data: {
          clerkId,
          name: "User",
          email: `${clerkId}@example.com`,
          avatarUrl: null,
        },
      });
    }

    const existing = await db.trip.findFirst({
      where: { tripName: body.trip_name },
    });

    if (existing) {
      return NextResponse.json(existing);
    }

    const trip = await db.trip.create({
      data: {
        userId: user.id,
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