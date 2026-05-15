import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertContactMessageSchema } from "@shared/schema";
import { fromError } from "zod-validation-error";
import { sendContactEmail } from "./email";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.post("/api/contact", async (req, res) => {
    const result = insertContactMessageSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ message: fromError(result.error).toString() });
    }
    const message = await storage.createContactMessage(result.data);

    try {
      await sendContactEmail(result.data);
    } catch (err) {
      console.error("Falha ao enviar e-mail de contato:", err);
    }

    return res.status(201).json({ success: true, id: message.id });
  });

  return httpServer;
}
