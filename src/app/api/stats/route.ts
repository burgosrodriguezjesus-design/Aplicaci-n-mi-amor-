import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ok, route } from "@/lib/api";

export const dynamic = "force-dynamic";

function lastSevenDays() {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    days.push(date.toISOString().slice(0, 10));
  }
  return days;
}

/** Datos del panel principal: continuar estudiando, recientes y estadísticas. */
export const GET = route(async () => {
  const user = await requireUser();
  const days = lastSevenDays();

  const [recent, inProgress, subjects, sessions, documentCount, readyCount] =
    await Promise.all([
      prisma.document.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 6,
        include: {
          subject: { select: { name: true, color: true, emoji: true } },
          progressRows: { where: { userId: user.id }, take: 1 },
        },
      }),
      prisma.studyProgress.findMany({
        where: { userId: user.id, percent: { gt: 0, lt: 100 } },
        orderBy: { updatedAt: "desc" },
        take: 4,
        include: {
          document: {
            include: { subject: { select: { name: true, color: true, emoji: true } } },
          },
        },
      }),
      prisma.subject.findMany({
        where: { userId: user.id },
        orderBy: [{ position: "asc" }],
        include: { _count: { select: { documents: true } } },
      }),
      prisma.studySession.findMany({
        where: { userId: user.id, day: { in: days } },
        select: { day: true, kind: true, seconds: true },
      }),
      prisma.document.count({ where: { userId: user.id } }),
      prisma.document.count({ where: { userId: user.id, status: "READY" } }),
    ]);

  const perDay = days.map((day) => ({
    day,
    readSeconds: sessions
      .filter((session) => session.day === day && session.kind === "READ")
      .reduce((sum, session) => sum + session.seconds, 0),
    listenSeconds: sessions
      .filter((session) => session.day === day && session.kind === "LISTEN")
      .reduce((sum, session) => sum + session.seconds, 0),
  }));

  return ok({
    recent: recent.map((document) => ({
      id: document.id,
      title: document.title,
      status: document.status,
      statusMessage: document.statusMessage,
      processingProgress: document.progress,
      pageCount: document.pageCount,
      subject: document.subject,
      studyPercent: document.progressRows[0]?.percent ?? 0,
      createdAt: document.createdAt,
    })),
    continueStudying: inProgress.map((row) => ({
      id: row.document.id,
      title: row.document.title,
      percent: row.percent,
      subject: row.document.subject,
      lastTab: row.lastTab,
      updatedAt: row.updatedAt,
    })),
    subjects: subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      color: subject.color,
      emoji: subject.emoji,
      documentCount: subject._count.documents,
    })),
    week: {
      perDay,
      readSeconds: perDay.reduce((sum, day) => sum + day.readSeconds, 0),
      listenSeconds: perDay.reduce((sum, day) => sum + day.listenSeconds, 0),
    },
    totals: { documentCount, readyCount },
  });
});
