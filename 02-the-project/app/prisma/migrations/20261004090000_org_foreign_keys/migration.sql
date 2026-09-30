-- Every tenant table points at its brokerage.
--
-- Fifty tables carried an `orgId` with no foreign key to "Organisation"
-- (the audit's C5): row-level security kept tenants apart, and nothing
-- stopped a row naming a brokerage that does not exist — an orphan no
-- screen shows and no erasure reaches.
--
-- `NOT VALID` enforces the key for every new and updated row without
-- scanning or locking what is already there, so this is safe on a live
-- database. `VALIDATE CONSTRAINT` can be run later, table by table, once
-- a check confirms no orphans exist (it takes only a SHARE UPDATE
-- EXCLUSIVE lock).
--
-- CASCADE, as the keys Prisma already declares from Lead and Listing do:
-- a brokerage is soft-deleted in the product and hard-deleted only by
-- tests. Except for the records the law makes us keep — invoices (VAT,
-- five years), due-diligence files, screenings, beneficial owners and
-- compliance reports (AML, five years) — where the database refuses to
-- delete a brokerage that still has them.

ALTER TABLE "AgentAvailability" ADD CONSTRAINT "AgentAvailability_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "AgentRequest" ADD CONSTRAINT "AgentRequest_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "AssignmentRule" ADD CONSTRAINT "AssignmentRule_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "BlackbookEntry" ADD CONSTRAINT "BlackbookEntry_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "CommissionPlan" ADD CONSTRAINT "CommissionPlan_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "CommissionSplit" ADD CONSTRAINT "CommissionSplit_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "ComplianceReport" ADD CONSTRAINT "ComplianceReport_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "ConversationCharge" ADD CONSTRAINT "ConversationCharge_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "DealMilestone" ADD CONSTRAINT "DealMilestone_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "DealPayment" ADD CONSTRAINT "DealPayment_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Document" ADD CONSTRAINT "Document_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "EmailAccount" ADD CONSTRAINT "EmailAccount_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "FollowUp" ADD CONSTRAINT "FollowUp_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "KycDocument" ADD CONSTRAINT "KycDocument_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "KycRecord" ADD CONSTRAINT "KycRecord_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "LeadOwnership" ADD CONSTRAINT "LeadOwnership_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "ListingPublication" ADD CONSTRAINT "ListingPublication_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Message" ADD CONSTRAINT "Message_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Migration" ADD CONSTRAINT "Migration_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "MigrationIssue" ADD CONSTRAINT "MigrationIssue_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "NotificationPrefs" ADD CONSTRAINT "NotificationPrefs_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "OfferResponse" ADD CONSTRAINT "OfferResponse_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "OnboardingStep" ADD CONSTRAINT "OnboardingStep_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "PlanStep" ADD CONSTRAINT "PlanStep_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "PlanSubscription" ADD CONSTRAINT "PlanSubscription_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "ReplyDraft" ADD CONSTRAINT "ReplyDraft_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Screening" ADD CONSTRAINT "Screening_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "SeatEvent" ADD CONSTRAINT "SeatEvent_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Secret" ADD CONSTRAINT "Secret_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "SupportGrant" ADD CONSTRAINT "SupportGrant_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "TaskPlan" ADD CONSTRAINT "TaskPlan_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "TeamVisibility" ADD CONSTRAINT "TeamVisibility_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "UltimateBeneficialOwner" ADD CONSTRAINT "UltimateBeneficialOwner_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "VendorReport" ADD CONSTRAINT "VendorReport_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
ALTER TABLE "ViewingFeedback" ADD CONSTRAINT "ViewingFeedback_orgId_organisation_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
