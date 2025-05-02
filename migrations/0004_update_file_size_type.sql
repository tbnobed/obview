-- Migration to update the file_size column from integer to bigint to support large files
-- This will allow file sizes larger than 2GB to be stored in the database

-- Change the file_size column type from INTEGER to BIGINT
ALTER TABLE files ALTER COLUMN file_size TYPE BIGINT;