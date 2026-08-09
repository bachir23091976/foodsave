import { prisma } from "./src/lib/prisma";

async function main() {
  const user = await prisma.user.findFirst({ where: { email: "medjadji.canada@gmail.com" } });
  if (!user) {
    console.log("Utilisateur introuvable");
    return;
  }
  const notif = await prisma.notification.create({
    data: { userId: user.id, message: "Test de notification manuelle" },
  });
  console.log("Notification créée :", notif);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });