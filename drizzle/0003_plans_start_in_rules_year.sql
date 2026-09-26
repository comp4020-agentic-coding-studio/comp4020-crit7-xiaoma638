-- Plans now start in the year their degree's rules are from.
UPDATE `plans` SET `start_year` = (SELECT `year` FROM `degrees` WHERE `degrees`.`code` = `plans`.`degree_code`)
WHERE EXISTS (SELECT 1 FROM `degrees` WHERE `degrees`.`code` = `plans`.`degree_code`);
