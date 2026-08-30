import { db } from "./client.js";
import { config } from "../config.js";
import type { TaskRow, TaskStatus, PrMode } from "./types.js";

export interface CreateTaskInput {
  issueNumber?: number;
  issueTitle: string;
  issueBody?: string;
  repo: string;
  orgSlug?: string;
}

export async function createTask(input: CreateTaskInput): Promise<TaskRow> {
  const { data, error } = await db()
    .from("tasks")
    .insert({
      issue_number: input.issueNumber ?? null,
      issue_title: input.issueTitle,
      issue_body: input.issueBody ?? null,
      repo: input.repo,
      status: "open",
      org_slug: input.orgSlug ?? config.orgSlug(),
    })
    .select()
    .single();
  if (error) throw new Error(`createTask failed: ${error.message}`);
  return data as TaskRow;
}

export async function getTask(id: string): Promise<TaskRow> {
  const { data, error } = await db().from("tasks").select("*").eq("id", id).single();
  if (error) throw new Error(`getTask ${id} failed: ${error.message}`);
  return data as TaskRow;
}

export interface TaskPatch {
  status?: TaskStatus;
  task_type?: string;
  pr_number?: number;
  pr_url?: string;
  pr_mode?: PrMode;
}

export async function patchTask(id: string, patch: TaskPatch): Promise<TaskRow> {
  const { data, error } = await db()
    .from("tasks")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`patchTask ${id} failed: ${error.message}`);
  return data as TaskRow;
}
