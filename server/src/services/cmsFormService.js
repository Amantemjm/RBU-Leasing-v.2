import { prisma } from "../lib/prisma.js";
import { NotFoundError } from "../lib/errors.js";

// Turn a form name into a URL-safe slug the front-end can reference a form by.
function slugify(name) {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "form";
}

// Find a slug not already used by another form (append -2, -3, … on collision).
async function uniqueSlug(base, ignoreId) {
  let slug = base;
  for (let n = 2; ; n += 1) {
    const existing = await prisma.cmsForm.findUnique({ where: { slug } });
    if (!existing || existing.id === ignoreId) return slug;
    slug = `${base}-${n}`;
  }
}

export function listCmsForms() {
  return prisma.cmsForm.findMany({ orderBy: { updatedAt: "desc" } });
}

export async function getCmsForm(id) {
  const form = await prisma.cmsForm.findUnique({ where: { id } });
  if (!form) throw new NotFoundError("Form not found");
  return form;
}

export async function createCmsForm(data) {
  const slug = await uniqueSlug(slugify(data.name));
  return prisma.cmsForm.create({
    data: {
      name: data.name,
      slug,
      description: data.description ?? null,
      fields: data.fields ?? [],
    },
  });
}

export async function updateCmsForm(id, data) {
  const form = await prisma.cmsForm.findUnique({ where: { id } });
  if (!form) throw new NotFoundError("Form not found");

  const patch = {};
  if (data.name !== undefined) {
    patch.name = data.name;
    // Keep the slug in step with the name, staying unique across other forms.
    patch.slug = await uniqueSlug(slugify(data.name), id);
  }
  if (data.description !== undefined) patch.description = data.description ?? null;
  if (data.fields !== undefined) patch.fields = data.fields;

  return prisma.cmsForm.update({ where: { id }, data: patch });
}

export async function deleteCmsForm(id) {
  const form = await prisma.cmsForm.findUnique({ where: { id } });
  if (!form) throw new NotFoundError("Form not found");
  await prisma.cmsForm.delete({ where: { id } });
}
