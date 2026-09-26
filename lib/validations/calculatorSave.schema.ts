import { z } from 'zod';
import { calculatorRequestSchema, homeStateEnum } from './room.schema';
import { calculatorEditsSchema, selectedProductSchema } from './project.schema';
import { draftPlanSchema, surfaceFinishSchema } from './design.schema';

/**
 * The calculator's drawing board as a project keeps it (`projects.calculator_board`): the plan
 * drawn on its plan step (a blank sheet too), the image it was read from, the finishes laid on
 * its placement step.
 */
export const calculatorBoardSchema = z.object({
  plan: draftPlanSchema.nullable(),
  floorPlanUrl: z.string().max(500).nullable(),
  finishes: z.array(surfaceFinishSchema).max(800),
});

/**
 * A project's calculation, as the calculator saves it into the project's row
 * (`POST /api/projects`). Before "start the calculation" it can be anything the first steps
 * have — no home state yet, no rooms yet; a calculation that has been worked out needs both.
 */
export const saveCalculatorSchema = z
  .object({
    /** The caller's project, made before its first step. */
    projectId: z.number().int().positive(),
    /** The calculation's revision this save was made from; an older one than the row's is refused (409). */
    baseRev: z.number().int().min(0).optional(),
    /** The person chose to keep this copy over one saved elsewhere since. */
    force: z.boolean().optional(),
    /** This save's id, and the previous one's when its answer never came back (`projects.calculator_save_id`). */
    saveId: z.string().min(1).max(64).optional(),
    prevSaveId: z.string().min(1).max(64).nullable().optional(),
    homeState: homeStateEnum.nullable(),
    rooms: z.array(calculatorRequestSchema.shape.rooms.element),
    selectedProducts: z.record(selectedProductSchema).default({}),
    selectedFurniture: z.record(z.array(selectedProductSchema)).default({}),
    edits: calculatorEditsSchema.optional(),
    board: calculatorBoardSchema.nullable().optional(),
    /** An autosave: keeps the row a draft (or whatever it already is) instead of marking it saved. */
    draft: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const calculated = data.edits?.progress?.calculated !== false;
    if (calculated && (!data.homeState || data.rooms.length === 0)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'A worked-out calculation needs a home state and at least one room' });
  });

export type SaveCalculatorInput = z.infer<typeof saveCalculatorSchema>;
