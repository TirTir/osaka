import { integer, real, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const trips = sqliteTable("trips", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  ownerUserId: text("owner_user_id").references(() => users.id),
  viewTokenHash: text("view_token_hash").unique(),
  createdAt: text("created_at").notNull(),
});

export const places = sqliteTable("places", {
  id: text("id").primaryKey(),
  tripId: text("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  sourceId: text("source_id"),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  category: text("category").notNull().default("place"),
  lat: real("lat").notNull(),
  lon: real("lon").notNull(),
  openingHours: text("opening_hours").notNull().default(""),
  menuUrl: text("menu_url").notNull().default(""),
  websiteUrl: text("website_url").notNull().default(""),
  notes: text("notes").notNull().default(""),
  day: integer("day"),
  position: integer("position").notNull().default(0),
  createdAt: text("created_at").notNull(),
}, table => [index("idx_places_trip_day_position").on(table.tripId, table.day, table.position)]);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  createdAt: text("created_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [index("idx_sessions_user_id").on(table.userId)]);

export const loginAttempts = sqliteTable("login_attempts", {
  id: text("id").primaryKey(),
  emailHash: text("email_hash").notNull(),
  createdAt: text("created_at").notNull(),
}, table => [index("idx_login_attempts_email_created").on(table.emailHash, table.createdAt)]);
