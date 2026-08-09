-- CreateEnum
CREATE TYPE "DietaryTag" AS ENUM ('VEGETARIAN', 'VEGAN', 'HALAL', 'GLUTEN_FREE', 'DAIRY_FREE', 'NUT_FREE');

-- AlterTable
ALTER TABLE "Offer" ADD COLUMN     "dietaryTags" "DietaryTag"[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dietaryPreferences" "DietaryTag"[];
