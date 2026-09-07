-- CreateEnum
CREATE TYPE "VisibilityMode" AS ENUM ('OPEN', 'RANKED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'AGENT', 'VIEWER', 'COMPLIANCE_OFFICER');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'QUALIFYING', 'QUALIFIED', 'VIEWING_BOOKED', 'NEGOTIATING', 'WON', 'LOST', 'UNRESPONSIVE');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('PROPERTY_FINDER', 'BAYUT', 'DUBIZZLE', 'WEBSITE', 'META_LEAD_ADS', 'WHATSAPP_AD', 'REFERRAL', 'WALK_IN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Intent" AS ENUM ('BUY_TO_LIVE', 'BUY_TO_INVEST', 'RENT', 'SELL', 'LIST');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "Author" AS ENUM ('LEAD', 'ASSISTANT', 'AGENT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- CreateEnum
CREATE TYPE "ChannelType" AS ENUM ('WHATSAPP', 'PROPERTY_FINDER', 'BAYUT', 'DUBIZZLE', 'WEBSITE_FORM', 'META_LEAD_ADS');

-- CreateEnum
CREATE TYPE "PublishState" AS ENUM ('PENDING', 'PUBLISHED', 'REJECTED', 'WITHDRAWN', 'FAILED');

-- CreateEnum
CREATE TYPE "Purpose" AS ENUM ('SALE', 'RENT');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'AVAILABLE', 'UNDER_OFFER', 'SOLD', 'LET', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ViewingStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('TEXT', 'NUMBER', 'MONEY', 'CHOICE', 'DATE', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('HANDOVER_WAITING', 'QUALIFIED_UNCLAIMED', 'VIEWING_TOMORROW', 'VIEWING_SOON', 'OUTCOME_MISSING', 'PERMIT_EXPIRING', 'DEAL_AT_RISK', 'PORTAL_SILENT', 'ASSISTANT_STOPPED', 'FOLLOW_UP_DUE');

-- CreateEnum
CREATE TYPE "StepState" AS ENUM ('TODO', 'IN_PROGRESS', 'WAITING', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "SubStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'RESTRICTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PAID', 'FAILED', 'VOID');

-- CreateEnum
CREATE TYPE "JobState" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('PAGE', 'TICKET', 'LOG');

-- CreateEnum
CREATE TYPE "DevicePlatform" AS ENUM ('IOS', 'ANDROID');

-- CreateEnum
CREATE TYPE "DealType" AS ENUM ('SALE', 'RENTAL', 'OFF_PLAN');

-- CreateEnum
CREATE TYPE "DealSide" AS ENUM ('BUYER', 'SELLER', 'BOTH', 'LANDLORD', 'TENANT');

-- CreateEnum
CREATE TYPE "DealStage" AS ENUM ('AGREED', 'MOU_SIGNED', 'DEPOSIT_PAID', 'MORTGAGE_APPLIED', 'VALUATION_DONE', 'FINAL_OFFER', 'LIABILITY_LETTER', 'NOC_APPLIED', 'NOC_RECEIVED', 'TRANSFER_BOOKED', 'COMPLETED', 'COLLAPSED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('FORECAST', 'INVOICED', 'RECEIVED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "SplitRole" AS ENUM ('LISTING_AGENT', 'SELLING_AGENT', 'REFERRER', 'MANAGER', 'BROKERAGE');

-- CreateEnum
CREATE TYPE "SubjectType" AS ENUM ('INDIVIDUAL', 'COMPANY', 'TRUST');

-- CreateEnum
CREATE TYPE "IdDocType" AS ENUM ('PASSPORT', 'EMIRATES_ID', 'GCC_ID', 'TRADE_LICENCE');

-- CreateEnum
CREATE TYPE "RiskRating" AS ENUM ('UNASSESSED', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('NOT_STARTED', 'COLLECTING', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ScreeningResult" AS ENUM ('CLEAR', 'POSSIBLE_MATCH', 'CONFIRMED_MATCH', 'ERROR');

-- CreateEnum
CREATE TYPE "ReportType" AS ENUM ('REAR', 'STR', 'SAR', 'CNMR', 'FFR', 'NO_FILING');

-- CreateEnum
CREATE TYPE "Financing" AS ENUM ('UNKNOWN', 'CASH', 'MORTGAGE');

-- CreateEnum
CREATE TYPE "RequirementSource" AS ENUM ('ASSISTANT', 'AGENT', 'LEAD');

-- CreateEnum
CREATE TYPE "AssignStrategy" AS ENUM ('ROUND_ROBIN', 'LEAST_LOADED', 'FASTEST', 'SPECIFIC', 'UNASSIGNED');

-- CreateEnum
CREATE TYPE "OwnershipReason" AS ENUM ('FIRST_ASSIGNMENT', 'RULE', 'MANUAL', 'CLAIMED', 'PROTECTION', 'PROTECTION_LAPSED', 'REASSIGNED', 'AGENT_LEFT');

-- CreateEnum
CREATE TYPE "DocumentOwner" AS ENUM ('LEAD', 'LISTING', 'DEAL', 'USER', 'ORGANISATION');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PASSPORT', 'EMIRATES_ID', 'VISA', 'TRADE_LICENCE', 'TITLE_DEED', 'NOC', 'SERVICE_CHARGE_CLEARANCE', 'EJARI', 'TENANCY_CONTRACT', 'FORM_F', 'SPA', 'FLOOR_PLAN', 'RERA_BROKER_CARD', 'BROKERAGE_LICENCE', 'TRAKHEESI_PERMIT', 'OTHER');

-- CreateEnum
CREATE TYPE "PlanAudience" AS ENUM ('BUYER', 'SELLER', 'LANDLORD', 'TENANT', 'PAST_CLIENT');

-- CreateEnum
CREATE TYPE "PlanAction" AS ENUM ('MESSAGE', 'TASK', 'CHECK_MATCHES', 'REVIEW');

-- CreateEnum
CREATE TYPE "SubscriptionState" AS ENUM ('RUNNING', 'PAUSED', 'COMPLETED', 'STOPPED');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('OFFERING', 'INTERESTED', 'NOT_FOR_ME', 'WRONG_PROPERTY');

-- CreateEnum
CREATE TYPE "FeedbackReason" AS ENUM ('PRICE_TOO_HIGH', 'TOO_SMALL', 'LAYOUT', 'CONDITION', 'LOCATION', 'VIEW', 'NOISE', 'PARKING', 'SERVICE_CHARGE', 'NOT_AS_ADVERTISED', 'BUYING_ELSEWHERE', 'OTHER');

-- CreateEnum
CREATE TYPE "MigrationState" AS ENUM ('DRAFT', 'STAGED', 'RECONCILED', 'PARALLEL', 'COMPLETE', 'ABANDONED');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('BLOCKER', 'DECISION', 'NOTE');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('BROCHURE', 'FLOOR_PLAN', 'PAYMENT_PLAN', 'PHOTO', 'DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactPreference" AS ENUM ('WHATSAPP', 'CALL', 'EMAIL', 'OFFERS_ONLY');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('SUBMITTED', 'PRESENTED', 'COUNTERED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN', 'LAPSED');

-- CreateEnum
CREATE TYPE "OfferParty" AS ENUM ('BUYER', 'VENDOR', 'AGENT');

-- CreateEnum
CREATE TYPE "OfferResponseKind" AS ENUM ('COUNTER', 'ACCEPT', 'REJECT', 'WITHDRAW', 'QUERY');

-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('GOOGLE', 'MICROSOFT');

-- CreateEnum
CREATE TYPE "Recipe" AS ENUM ('COMPARABLES', 'LISTING_PITCH', 'VENDOR_UPDATE', 'LOG_CONTACT', 'BOOK_VIEWING', 'DRAFT_REPLY', 'DAY_BRIEF', 'UNCLEAR');

-- CreateEnum
CREATE TYPE "RequestState" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'REFUSED', 'ESCALATED');

-- CreateTable
CREATE TABLE "Organisation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Dubai',
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "emailVerified" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'AGENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'AGENT',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "stageId" TEXT,
    "position" DECIMAL NOT NULL DEFAULT 0,
    "stageEnteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "score" INTEGER,
    "source" "LeadSource" NOT NULL DEFAULT 'UNKNOWN',
    "budgetMinFils" BIGINT,
    "budgetMaxFils" BIGINT,
    "intent" "Intent",
    "timeframe" TEXT,
    "financing" TEXT,
    "notes" TEXT,
    "assignedToId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "visaExpiresAt" TIMESTAMP(3),
    "visaNudgedAt" TIMESTAMP(3),
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "optedOutOfOutreach" BOOLEAN NOT NULL DEFAULT false,
    "optedOutAt" TIMESTAMP(3),
    "lastOutreachAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "maps" "LeadStatus" NOT NULL,
    "staleAfterDays" INTEGER,
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "isLost" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "lastInboundAt" TIMESTAMP(3),
    "lastOutboundAt" TIMESTAMP(3),
    "humanHandover" BOOLEAN NOT NULL DEFAULT false,
    "handoverAt" TIMESTAMP(3),
    "handoverReason" TEXT,
    "assistantMuted" BOOLEAN NOT NULL DEFAULT false,
    "assistantMutedBy" TEXT,
    "assistantMutedAt" TIMESTAMP(3),
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "author" "Author" NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "mediaUrl" TEXT,
    "templateName" TEXT,
    "externalId" TEXT,
    "status" "MessageStatus" NOT NULL DEFAULT 'PENDING',
    "failure" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" "ChannelType" NOT NULL,
    "label" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "secretRef" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "community" TEXT,
    "building" TEXT,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "areaSqft" INTEGER,
    "priceFils" BIGINT,
    "purpose" "Purpose" NOT NULL DEFAULT 'SALE',
    "status" "ListingStatus" NOT NULL DEFAULT 'AVAILABLE',
    "vendorId" TEXT,
    "permitNumber" TEXT,
    "permitExpiresAt" TIMESTAMP(3),
    "reraBrokerCard" TEXT,
    "descriptions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListingPublication" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "state" "PublishState" NOT NULL DEFAULT 'PENDING',
    "externalId" TEXT,
    "rejection" TEXT,
    "publishedAt" TIMESTAMP(3),
    "lastTriedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ListingPublication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enquiry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "listingId" TEXT,
    "channelId" TEXT NOT NULL,
    "externalId" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Enquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Viewing" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "listingId" TEXT,
    "agentId" TEXT,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMins" INTEGER NOT NULL DEFAULT 30,
    "timespan" tstzrange,
    "address" TEXT,
    "building" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "accessNote" TEXT,
    "status" "ViewingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "outcome" TEXT,
    "heldUntil" TIMESTAMP(3),
    "remindedLeadAt" TIMESTAMP(3),
    "remindedAgentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Viewing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkingHours" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "WorkingHours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualificationProfile" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "tone" TEXT,
    "languages" TEXT[] DEFAULT ARRAY['en', 'ar']::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualificationProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL DEFAULT 'TEXT',
    "options" TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Answer" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" "Author" NOT NULL DEFAULT 'AGENT',
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "activeOrgId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "TeamVisibility" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "mode" "VisibilityMode" NOT NULL DEFAULT 'RANKED',
    "agentHeadStartHours" INTEGER NOT NULL DEFAULT 24,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamVisibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssistantSettings" (
    "orgId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "pausedReason" TEXT,
    "pausedAt" TIMESTAMP(3),
    "pausedById" TEXT,
    "monthlyBudgetFils" BIGINT,
    "warnAtPercent" INTEGER NOT NULL DEFAULT 80,
    "promptVersion" TEXT NOT NULL DEFAULT 'current',
    "handoverAboveBudget" DECIMAL(14,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssistantSettings_pkey" PRIMARY KEY ("orgId")
);

-- CreateTable
CREATE TABLE "AssistantUsage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "conversationId" TEXT,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costFils" BIGINT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "outcome" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssistantUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPrefs" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "push" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "quietFromMin" INTEGER,
    "quietToMin" INTEGER,
    "daysOff" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "urgentOverridesQuiet" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NotificationPrefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "subjectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deeplink" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "actedAt" TIMESTAMP(3),
    "escalation" INTEGER NOT NULL DEFAULT 0,
    "suppressed" TEXT,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingStep" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "state" "StepState" NOT NULL DEFAULT 'TODO',
    "blockedOn" TEXT,
    "note" TEXT,
    "startedAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "doneById" TEXT,

    CONSTRAINT "OnboardingStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportGrant" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "staffEmail" TEXT NOT NULL,
    "canWrite" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,

    CONSTRAINT "SupportGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "seatPriceFils" BIGINT NOT NULL,
    "includedPerSeat" INTEGER NOT NULL DEFAULT 60,
    "overageFils" BIGINT NOT NULL DEFAULT 35,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "status" "SubStatus" NOT NULL DEFAULT 'TRIALING',
    "trialEndsAt" TIMESTAMP(3),
    "currentFrom" TIMESTAMP(3) NOT NULL,
    "currentTo" TIMESTAMP(3) NOT NULL,
    "providerCustomerId" TEXT,
    "providerSubId" TEXT,
    "trn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeatEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "subId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "change" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "SeatEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "subId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "seatDays" INTEGER NOT NULL,
    "seatDaysFull" INTEGER NOT NULL,
    "seatFils" BIGINT NOT NULL DEFAULT 0,
    "conversationsAnswered" INTEGER NOT NULL DEFAULT 0,
    "conversationsIncluded" INTEGER NOT NULL DEFAULT 0,
    "overageFils" BIGINT NOT NULL DEFAULT 0,
    "subtotalFils" BIGINT NOT NULL,
    "vatRateBp" INTEGER NOT NULL DEFAULT 500,
    "vatFils" BIGINT NOT NULL,
    "totalFils" BIGINT NOT NULL,
    "providerRef" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "state" "JobState" NOT NULL DEFAULT 'RUNNING',
    "result" JSONB,
    "error" TEXT,
    "durationMs" INTEGER,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "invoiceId" TEXT,
    "handledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "orgId" TEXT,
    "severity" "AlertSeverity" NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "runbook" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenCount" INTEGER NOT NULL DEFAULT 1,
    "notifiedAt" TIMESTAMP(3),
    "ackedAt" TIMESTAMP(3),
    "ackedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushDevice" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" "DevicePlatform" NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'expo',
    "appVersion" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failedAt" TIMESTAMP(3),
    "failReason" TEXT,

    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT,
    "listingId" TEXT,
    "reference" TEXT NOT NULL,
    "type" "DealType" NOT NULL,
    "valueFils" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AED',
    "side" "DealSide" NOT NULL DEFAULT 'SELLER',
    "stage" "DealStage" NOT NULL DEFAULT 'AGREED',
    "financing" "Financing" NOT NULL DEFAULT 'UNKNOWN',
    "sellerHasMortgage" BOOLEAN NOT NULL DEFAULT false,
    "agreedAt" TIMESTAMP(3),
    "contractualCompletionAt" TIMESTAMP(3),
    "expectedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "collapsedAt" TIMESTAMP(3),
    "collapseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Commission" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "rateBp" INTEGER NOT NULL,
    "grossFils" BIGINT NOT NULL,
    "vatFils" BIGINT NOT NULL,
    "netFils" BIGINT NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'FORECAST',
    "invoicedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),

    CONSTRAINT "Commission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionSplit" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "commissionId" TEXT NOT NULL,
    "userId" TEXT,
    "externalName" TEXT,
    "role" "SplitRole" NOT NULL,
    "shareBp" INTEGER NOT NULL,
    "amountFils" BIGINT NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paidRef" TEXT,

    CONSTRAINT "CommissionSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionPlan" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tiers" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),

    CONSTRAINT "CommissionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycRecord" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "subjectType" "SubjectType" NOT NULL DEFAULT 'INDIVIDUAL',
    "legalName" TEXT NOT NULL,
    "nationality" TEXT,
    "tradeLicence" TEXT,
    "idType" "IdDocType",
    "idNumber" TEXT,
    "idExpiresAt" TIMESTAMP(3),
    "sourceOfFunds" TEXT,
    "sourceOfWealth" TEXT,
    "riskRating" "RiskRating" NOT NULL DEFAULT 'UNASSESSED',
    "riskReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPep" BOOLEAN NOT NULL DEFAULT false,
    "status" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "reviewDueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KycRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UltimateBeneficialOwner" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kycId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "nationality" TEXT,
    "ownershipBp" INTEGER,
    "idType" "IdDocType",
    "idNumber" TEXT,

    CONSTRAINT "UltimateBeneficialOwner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KycDocument" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kycId" TEXT NOT NULL,
    "type" "IdDocType" NOT NULL,
    "storageRef" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "collectedVia" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KycDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Screening" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kycId" TEXT,
    "uboId" TEXT,
    "nameChecked" TEXT NOT NULL,
    "lists" TEXT[],
    "provider" TEXT NOT NULL,
    "result" "ScreeningResult" NOT NULL,
    "matches" JSONB,
    "screenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clearedById" TEXT,
    "clearedNote" TEXT,

    CONSTRAINT "Screening_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceReport" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "dealId" TEXT,
    "kycId" TEXT,
    "type" "ReportType" NOT NULL,
    "rationale" TEXT NOT NULL,
    "cashFils" BIGINT,
    "filedAt" TIMESTAMP(3),
    "goamlRef" TEXT,
    "decidedById" TEXT NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notFiledReason" TEXT,

    CONSTRAINT "ComplianceReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DealMilestone" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "stage" "DealStage" NOT NULL,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,
    "slippedByDays" INTEGER,
    "blockedReason" TEXT,
    "note" TEXT,

    CONSTRAINT "DealMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Requirement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "label" TEXT,
    "purpose" "Purpose" NOT NULL DEFAULT 'SALE',
    "intent" "Intent",
    "budgetMinFils" BIGINT,
    "budgetMaxFils" BIGINT,
    "bedroomsMin" INTEGER,
    "bedroomsMax" INTEGER,
    "areaMinSqft" INTEGER,
    "communities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferences" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "source" "RequirementSource" NOT NULL DEFAULT 'ASSISTANT',
    "confidence" DOUBLE PRECISION,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentRule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sources" "LeadSource"[] DEFAULT ARRAY[]::"LeadSource"[],
    "communities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minBudgetFils" BIGINT,
    "maxBudgetFils" BIGINT,
    "strategy" "AssignStrategy" NOT NULL DEFAULT 'ROUND_ROBIN',
    "userIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "AssignmentRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadOwnership" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT,
    "fromUserId" TEXT,
    "reason" "OwnershipReason" NOT NULL,
    "ruleId" TEXT,
    "actorId" TEXT,
    "note" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "LeadOwnership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentAvailability" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acceptingLeads" BOOLEAN NOT NULL DEFAULT true,
    "capacity" INTEGER NOT NULL DEFAULT 40,
    "awayFrom" TIMESTAMP(3),
    "awayTo" TIMESTAMP(3),
    "awayNote" TEXT,
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "communities" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "AgentAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "ownerType" "DocumentOwner" NOT NULL,
    "ownerId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageRef" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "mimeType" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "uploadedById" TEXT,
    "uploadedVia" TEXT NOT NULL DEFAULT 'WEB',
    "supersededById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskPlan" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "audience" "PlanAudience" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanStep" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "afterDays" INTEGER NOT NULL,
    "action" "PlanAction" NOT NULL,
    "template" TEXT,
    "taskTitle" TEXT,
    "note" TEXT,

    CONSTRAINT "PlanStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanSubscription" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "state" "SubscriptionState" NOT NULL DEFAULT 'RUNNING',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "nextDueAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "endedReason" TEXT,

    CONSTRAINT "PlanSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ViewingFeedback" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "viewingId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "listingId" TEXT,
    "verdict" "Verdict",
    "reasons" "FeedbackReason"[] DEFAULT ARRAY[]::"FeedbackReason"[],
    "comment" TEXT,
    "askedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'WHATSAPP',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ViewingFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorReport" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3) NOT NULL,
    "periodTo" TIMESTAMP(3) NOT NULL,
    "viewings" INTEGER NOT NULL,
    "offers" INTEGER NOT NULL,
    "summary" JSONB NOT NULL,
    "priceSignal" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentVia" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Migration" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "state" "MigrationState" NOT NULL DEFAULT 'DRAFT',
    "stagedCounts" JSONB,
    "claimedCounts" JSONB,
    "sourceArchiveRef" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cutoverAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "abandonedAt" TIMESTAMP(3),
    "abandonReason" TEXT,

    CONSTRAINT "Migration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MigrationIssue" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "migrationId" TEXT NOT NULL,
    "severity" "IssueSeverity" NOT NULL,
    "kind" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "sourceRef" TEXT,
    "detail" TEXT NOT NULL,
    "suggestion" TEXT,
    "decision" TEXT,
    "decidedById" TEXT,

    CONSTRAINT "MigrationIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "messageId" TEXT,
    "listingId" TEXT,
    "kind" "AttachmentKind" NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageRef" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitHit" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateLimitHit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "prefers" "ContactPreference" NOT NULL DEFAULT 'WHATSAPP',
    "reportDay" INTEGER DEFAULT 4,
    "reportsOff" BOOLEAN NOT NULL DEFAULT false,
    "actingFor" TEXT,
    "lastReportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "leadId" TEXT,
    "vendorId" TEXT,
    "agentId" TEXT,
    "amountFils" BIGINT NOT NULL,
    "financing" "Financing" NOT NULL DEFAULT 'UNKNOWN',
    "preApproved" BOOLEAN NOT NULL DEFAULT false,
    "preApprovalRef" TEXT,
    "conditions" TEXT,
    "sellerHasMortgage" BOOLEAN NOT NULL DEFAULT false,
    "status" "OfferStatus" NOT NULL DEFAULT 'SUBMITTED',
    "expiresAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfferResponse" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "by" "OfferParty" NOT NULL,
    "kind" "OfferResponseKind" NOT NULL,
    "amountFils" BIGINT,
    "note" TEXT,
    "recordedById" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfferResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationCharge" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "subId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlackbookEntry" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "leadId" TEXT,
    "vendorId" TEXT,
    "standaloneName" TEXT,
    "standalonePhone" TEXT,
    "standaloneEmail" TEXT,
    "nickname" TEXT,
    "privateNote" TEXT,
    "tags" TEXT[],
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "lastTouched" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BlackbookEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAccount" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL,
    "address" TEXT NOT NULL,
    "secretRef" TEXT NOT NULL,
    "cursor" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailMessage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddresses" TEXT[],
    "subject" TEXT,
    "snippet" TEXT,
    "leadId" TEXT,
    "vendorId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "webLink" TEXT,

    CONSTRAINT "EmailMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "audioRef" TEXT,
    "recipe" "Recipe" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "listingId" TEXT,
    "leadId" TEXT,
    "vendorId" TEXT,
    "state" "RequestState" NOT NULL DEFAULT 'QUEUED',
    "outputRef" TEXT,
    "caveats" TEXT[],
    "escalatedTo" TEXT,
    "escalationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUp" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "leadId" TEXT,
    "vendorId" TEXT,
    "blackbookEntryId" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organisation_slug_key" ON "Organisation"("slug");

-- CreateIndex
CREATE INDEX "Organisation_deletedAt_idx" ON "Organisation"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Membership_orgId_idx" ON "Membership"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_orgId_userId_key" ON "Membership"("orgId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_orgId_idx" ON "Invitation"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_orgId_email_key" ON "Invitation"("orgId", "email");

-- CreateIndex
CREATE INDEX "Lead_orgId_status_idx" ON "Lead"("orgId", "status");

-- CreateIndex
CREATE INDEX "Lead_orgId_assignedToId_idx" ON "Lead"("orgId", "assignedToId");

-- CreateIndex
CREATE INDEX "Lead_orgId_createdAt_idx" ON "Lead"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_orgId_stageId_position_idx" ON "Lead"("orgId", "stageId", "position");

-- CreateIndex
CREATE INDEX "Lead_orgId_stageId_stageEnteredAt_idx" ON "Lead"("orgId", "stageId", "stageEnteredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_orgId_phone_key" ON "Lead"("orgId", "phone");

-- CreateIndex
CREATE INDEX "PipelineStage_orgId_position_idx" ON "PipelineStage"("orgId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "PipelineStage_orgId_name_key" ON "PipelineStage"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_leadId_key" ON "Conversation"("leadId");

-- CreateIndex
CREATE INDEX "Conversation_orgId_updatedAt_idx" ON "Conversation"("orgId", "updatedAt");

-- CreateIndex
CREATE INDEX "Conversation_orgId_humanHandover_idx" ON "Conversation"("orgId", "humanHandover");

-- CreateIndex
CREATE UNIQUE INDEX "Message_externalId_key" ON "Message"("externalId");

-- CreateIndex
CREATE INDEX "Message_orgId_conversationId_sentAt_idx" ON "Message"("orgId", "conversationId", "sentAt");

-- CreateIndex
CREATE INDEX "Channel_orgId_active_idx" ON "Channel"("orgId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Channel_orgId_type_identifier_key" ON "Channel"("orgId", "type", "identifier");

-- CreateIndex
CREATE INDEX "Listing_orgId_status_idx" ON "Listing"("orgId", "status");

-- CreateIndex
CREATE INDEX "Listing_orgId_permitExpiresAt_idx" ON "Listing"("orgId", "permitExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Listing_orgId_reference_key" ON "Listing"("orgId", "reference");

-- CreateIndex
CREATE INDEX "ListingPublication_orgId_state_idx" ON "ListingPublication"("orgId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "ListingPublication_listingId_channelId_key" ON "ListingPublication"("listingId", "channelId");

-- CreateIndex
CREATE INDEX "Enquiry_orgId_leadId_idx" ON "Enquiry"("orgId", "leadId");

-- CreateIndex
CREATE INDEX "Enquiry_orgId_createdAt_idx" ON "Enquiry"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "Enquiry_channelId_createdAt_idx" ON "Enquiry"("channelId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Enquiry_orgId_externalId_key" ON "Enquiry"("orgId", "externalId");

-- CreateIndex
CREATE INDEX "Viewing_orgId_scheduledAt_idx" ON "Viewing"("orgId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Viewing_orgId_agentId_scheduledAt_idx" ON "Viewing"("orgId", "agentId", "scheduledAt");

-- CreateIndex
CREATE INDEX "Viewing_orgId_status_scheduledAt_idx" ON "Viewing"("orgId", "status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkingHours_orgId_dayOfWeek_key" ON "WorkingHours"("orgId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "QualificationProfile_orgId_active_idx" ON "QualificationProfile"("orgId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "QualificationProfile_orgId_name_version_key" ON "QualificationProfile"("orgId", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Question_profileId_key_key" ON "Question"("profileId", "key");

-- CreateIndex
CREATE INDEX "Answer_orgId_leadId_idx" ON "Answer"("orgId", "leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Answer_leadId_questionId_key" ON "Answer"("leadId", "questionId");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_createdAt_idx" ON "AuditLog"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_orgId_entity_entityId_idx" ON "AuditLog"("orgId", "entity", "entityId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "TeamVisibility_orgId_key" ON "TeamVisibility"("orgId");

-- CreateIndex
CREATE INDEX "AssistantUsage_orgId_createdAt_idx" ON "AssistantUsage"("orgId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPrefs_orgId_userId_key" ON "NotificationPrefs"("orgId", "userId");

-- CreateIndex
CREATE INDEX "Notification_orgId_userId_readAt_idx" ON "Notification"("orgId", "userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_orgId_kind_subjectId_sentAt_idx" ON "Notification"("orgId", "kind", "subjectId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_orgId_userId_kind_subjectId_key" ON "Notification"("orgId", "userId", "kind", "subjectId");

-- CreateIndex
CREATE INDEX "OnboardingStep_orgId_state_idx" ON "OnboardingStep"("orgId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingStep_orgId_key_key" ON "OnboardingStep"("orgId", "key");

-- CreateIndex
CREATE INDEX "SupportGrant_orgId_expiresAt_idx" ON "SupportGrant"("orgId", "expiresAt");

-- CreateIndex
CREATE INDEX "SupportGrant_staffEmail_expiresAt_idx" ON "SupportGrant"("staffEmail", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_orgId_key" ON "Subscription"("orgId");

-- CreateIndex
CREATE INDEX "SeatEvent_orgId_at_idx" ON "SeatEvent"("orgId", "at");

-- CreateIndex
CREATE INDEX "SeatEvent_subId_at_idx" ON "SeatEvent"("subId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_providerRef_key" ON "Invoice"("providerRef");

-- CreateIndex
CREATE INDEX "Invoice_orgId_issuedAt_idx" ON "Invoice"("orgId", "issuedAt");

-- CreateIndex
CREATE INDEX "JobRun_job_startedAt_idx" ON "JobRun"("job", "startedAt");

-- CreateIndex
CREATE INDEX "JobRun_state_startedAt_idx" ON "JobRun"("state", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_providerId_key" ON "PaymentEvent"("providerId");

-- CreateIndex
CREATE INDEX "PaymentEvent_invoiceId_idx" ON "PaymentEvent"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_key_key" ON "Alert"("key");

-- CreateIndex
CREATE INDEX "Alert_severity_resolvedAt_idx" ON "Alert"("severity", "resolvedAt");

-- CreateIndex
CREATE INDEX "Alert_orgId_resolvedAt_idx" ON "Alert"("orgId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_token_key" ON "PushDevice"("token");

-- CreateIndex
CREATE INDEX "PushDevice_userId_failedAt_idx" ON "PushDevice"("userId", "failedAt");

-- CreateIndex
CREATE INDEX "PushDevice_orgId_idx" ON "PushDevice"("orgId");

-- CreateIndex
CREATE INDEX "Deal_orgId_stage_idx" ON "Deal"("orgId", "stage");

-- CreateIndex
CREATE INDEX "Deal_orgId_expectedAt_idx" ON "Deal"("orgId", "expectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Deal_orgId_reference_key" ON "Deal"("orgId", "reference");

-- CreateIndex
CREATE INDEX "Commission_orgId_status_idx" ON "Commission"("orgId", "status");

-- CreateIndex
CREATE INDEX "CommissionSplit_orgId_userId_paidAt_idx" ON "CommissionSplit"("orgId", "userId", "paidAt");

-- CreateIndex
CREATE INDEX "CommissionPlan_orgId_userId_effectiveFrom_idx" ON "CommissionPlan"("orgId", "userId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "KycRecord_leadId_key" ON "KycRecord"("leadId");

-- CreateIndex
CREATE INDEX "KycRecord_orgId_status_idx" ON "KycRecord"("orgId", "status");

-- CreateIndex
CREATE INDEX "KycRecord_orgId_riskRating_idx" ON "KycRecord"("orgId", "riskRating");

-- CreateIndex
CREATE INDEX "KycRecord_orgId_reviewDueAt_idx" ON "KycRecord"("orgId", "reviewDueAt");

-- CreateIndex
CREATE INDEX "UltimateBeneficialOwner_orgId_kycId_idx" ON "UltimateBeneficialOwner"("orgId", "kycId");

-- CreateIndex
CREATE INDEX "KycDocument_orgId_expiresAt_idx" ON "KycDocument"("orgId", "expiresAt");

-- CreateIndex
CREATE INDEX "Screening_orgId_result_screenedAt_idx" ON "Screening"("orgId", "result", "screenedAt");

-- CreateIndex
CREATE INDEX "ComplianceReport_orgId_type_decidedAt_idx" ON "ComplianceReport"("orgId", "type", "decidedAt");

-- CreateIndex
CREATE INDEX "DealMilestone_orgId_dueAt_completedAt_idx" ON "DealMilestone"("orgId", "dueAt", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DealMilestone_dealId_stage_key" ON "DealMilestone"("dealId", "stage");

-- CreateIndex
CREATE INDEX "Requirement_orgId_active_expiresAt_idx" ON "Requirement"("orgId", "active", "expiresAt");

-- CreateIndex
CREATE INDEX "Requirement_orgId_leadId_idx" ON "Requirement"("orgId", "leadId");

-- CreateIndex
CREATE INDEX "AssignmentRule_orgId_active_priority_idx" ON "AssignmentRule"("orgId", "active", "priority");

-- CreateIndex
CREATE INDEX "LeadOwnership_orgId_leadId_startedAt_idx" ON "LeadOwnership"("orgId", "leadId", "startedAt");

-- CreateIndex
CREATE INDEX "LeadOwnership_orgId_userId_endedAt_idx" ON "LeadOwnership"("orgId", "userId", "endedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentAvailability_orgId_userId_key" ON "AgentAvailability"("orgId", "userId");

-- CreateIndex
CREATE INDEX "Document_orgId_expiresAt_supersededById_idx" ON "Document"("orgId", "expiresAt", "supersededById");

-- CreateIndex
CREATE INDEX "Document_orgId_ownerType_ownerId_idx" ON "Document"("orgId", "ownerType", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskPlan_orgId_name_key" ON "TaskPlan"("orgId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PlanStep_planId_order_key" ON "PlanStep"("planId", "order");

-- CreateIndex
CREATE INDEX "PlanSubscription_orgId_state_nextDueAt_idx" ON "PlanSubscription"("orgId", "state", "nextDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlanSubscription_leadId_planId_key" ON "PlanSubscription"("leadId", "planId");

-- CreateIndex
CREATE UNIQUE INDEX "ViewingFeedback_viewingId_key" ON "ViewingFeedback"("viewingId");

-- CreateIndex
CREATE INDEX "ViewingFeedback_orgId_listingId_answeredAt_idx" ON "ViewingFeedback"("orgId", "listingId", "answeredAt");

-- CreateIndex
CREATE INDEX "VendorReport_orgId_listingId_createdAt_idx" ON "VendorReport"("orgId", "listingId", "createdAt");

-- CreateIndex
CREATE INDEX "Migration_orgId_state_idx" ON "Migration"("orgId", "state");

-- CreateIndex
CREATE INDEX "MigrationIssue_migrationId_severity_idx" ON "MigrationIssue"("migrationId", "severity");

-- CreateIndex
CREATE INDEX "Attachment_orgId_listingId_idx" ON "Attachment"("orgId", "listingId");

-- CreateIndex
CREATE INDEX "Attachment_messageId_idx" ON "Attachment"("messageId");

-- CreateIndex
CREATE INDEX "RateLimitHit_action_key_at_idx" ON "RateLimitHit"("action", "key", "at");

-- CreateIndex
CREATE INDEX "RateLimitHit_at_idx" ON "RateLimitHit"("at");

-- CreateIndex
CREATE INDEX "Vendor_orgId_idx" ON "Vendor"("orgId");

-- CreateIndex
CREATE INDEX "Vendor_orgId_phone_idx" ON "Vendor"("orgId", "phone");

-- CreateIndex
CREATE INDEX "Offer_orgId_listingId_submittedAt_idx" ON "Offer"("orgId", "listingId", "submittedAt");

-- CreateIndex
CREATE INDEX "Offer_orgId_status_idx" ON "Offer"("orgId", "status");

-- CreateIndex
CREATE INDEX "OfferResponse_orgId_offerId_at_idx" ON "OfferResponse"("orgId", "offerId", "at");

-- CreateIndex
CREATE INDEX "ConversationCharge_orgId_subId_day_idx" ON "ConversationCharge"("orgId", "subId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationCharge_conversationId_day_key" ON "ConversationCharge"("conversationId", "day");

-- CreateIndex
CREATE INDEX "BlackbookEntry_orgId_agentId_lastTouched_idx" ON "BlackbookEntry"("orgId", "agentId", "lastTouched");

-- CreateIndex
CREATE UNIQUE INDEX "BlackbookEntry_agentId_leadId_key" ON "BlackbookEntry"("agentId", "leadId");

-- CreateIndex
CREATE UNIQUE INDEX "BlackbookEntry_agentId_vendorId_key" ON "BlackbookEntry"("agentId", "vendorId");

-- CreateIndex
CREATE INDEX "EmailAccount_orgId_active_idx" ON "EmailAccount"("orgId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "EmailAccount_agentId_address_key" ON "EmailAccount"("agentId", "address");

-- CreateIndex
CREATE INDEX "EmailMessage_orgId_leadId_sentAt_idx" ON "EmailMessage"("orgId", "leadId", "sentAt");

-- CreateIndex
CREATE INDEX "EmailMessage_orgId_threadId_idx" ON "EmailMessage"("orgId", "threadId");

-- CreateIndex
CREATE UNIQUE INDEX "EmailMessage_accountId_externalId_key" ON "EmailMessage"("accountId", "externalId");

-- CreateIndex
CREATE INDEX "AgentRequest_orgId_agentId_createdAt_idx" ON "AgentRequest"("orgId", "agentId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRequest_orgId_state_idx" ON "AgentRequest"("orgId", "state");

-- CreateIndex
CREATE INDEX "FollowUp_orgId_agentId_dueAt_completedAt_idx" ON "FollowUp"("orgId", "agentId", "dueAt", "completedAt");

-- CreateIndex
CREATE INDEX "FollowUp_orgId_dueAt_notifiedAt_idx" ON "FollowUp"("orgId", "dueAt", "notifiedAt");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "PipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStage" ADD CONSTRAINT "PipelineStage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Channel" ADD CONSTRAINT "Channel_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListingPublication" ADD CONSTRAINT "ListingPublication_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enquiry" ADD CONSTRAINT "Enquiry_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Viewing" ADD CONSTRAINT "Viewing_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkingHours" ADD CONSTRAINT "WorkingHours_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualificationProfile" ADD CONSTRAINT "QualificationProfile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "QualificationProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Answer" ADD CONSTRAINT "Answer_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "QualificationProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantSettings" ADD CONSTRAINT "AssistantSettings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssistantUsage" ADD CONSTRAINT "AssistantUsage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeatEvent" ADD CONSTRAINT "SeatEvent_subId_fkey" FOREIGN KEY ("subId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subId_fkey" FOREIGN KEY ("subId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Commission" ADD CONSTRAINT "Commission_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionSplit" ADD CONSTRAINT "CommissionSplit_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "Commission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UltimateBeneficialOwner" ADD CONSTRAINT "UltimateBeneficialOwner_kycId_fkey" FOREIGN KEY ("kycId") REFERENCES "KycRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KycDocument" ADD CONSTRAINT "KycDocument_kycId_fkey" FOREIGN KEY ("kycId") REFERENCES "KycRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Screening" ADD CONSTRAINT "Screening_kycId_fkey" FOREIGN KEY ("kycId") REFERENCES "KycRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Screening" ADD CONSTRAINT "Screening_uboId_fkey" FOREIGN KEY ("uboId") REFERENCES "UltimateBeneficialOwner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DealMilestone" ADD CONSTRAINT "DealMilestone_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requirement" ADD CONSTRAINT "Requirement_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanStep" ADD CONSTRAINT "PlanStep_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TaskPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanSubscription" ADD CONSTRAINT "PlanSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TaskPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MigrationIssue" ADD CONSTRAINT "MigrationIssue_migrationId_fkey" FOREIGN KEY ("migrationId") REFERENCES "Migration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfferResponse" ADD CONSTRAINT "OfferResponse_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================
-- Row-level security. Sourced from src/server/db/rls.sql.
-- Part of the migration because RLS applied by hand is RLS that
-- one day is not applied at all — and it is the tenant boundary.
-- ============================================================

-- Potato CRM — row-level security
--
-- This file is the actual tenant boundary. Everything above it in the
-- stack is convenience.
--
-- The argument for doing it here rather than in application code: a
-- `where orgId` clause is one forgotten line away from serving one
-- brokerage another brokerage's client list, and that mistake looks
-- exactly like working code in review. With RLS on, a query that forgets
-- the clause returns nothing instead of returning everything.
--
-- ---------------------------------------------------------------------
-- WHY THIS FILE IS NOW GENERATED FROM THE SCHEMA
-- ---------------------------------------------------------------------
--
-- It used to name twelve tables in a hand-written list. The schema has
-- **fifty-nine tables carrying `orgId`**. The other forty-seven had no
-- row-level security of any kind, and they are not the unimportant ones:
--
--   KycRecord, KycDocument, Screening, UltimateBeneficialOwner,
--   ComplianceReport   — every AML record in the product
--   Deal, Offer, OfferResponse, Commission, CommissionSplit — the money
--   BlackbookEntry     — an agent's private contacts
--   EmailMessage, EmailAccount, Attachment, Document
--   Invoice, Subscription, SeatEvent
--
-- The promise on the security page is that tenant isolation is enforced
-- by the database. For those forty-seven tables it was enforced by
-- remembering to write `where orgId`, which is exactly the thing this
-- file exists because nobody can be relied on to do.
--
-- A hand-maintained list of tables in a product that adds models will
-- drift, and it drifted from twelve to fifty-nine without anybody
-- noticing. So the policy is applied by asking the catalogue which
-- tables have an `orgId` column. A new model is protected the moment it
-- is migrated, and forgetting to add it to a list is no longer a
-- mistake that can be made.
--
-- ---------------------------------------------------------------------
-- THE ROLES THIS ASSUMES
-- ---------------------------------------------------------------------
--
-- `potato_app` owns nothing and has no BYPASSRLS, so every policy below
-- applies to it. `forOrg()` sets `app.current_org` inside the
-- transaction and the query is scoped by the database rather than by
-- the caller's diligence.
--
-- **The scheduled jobs and the webhooks are a different case and are not
-- solved by this file.** `crossTenant()` deliberately queries across
-- brokerages — a nightly sweep is meant to. Under these policies a
-- connection that has not set `app.current_org` sees nothing at all,
-- which is the correct default and also means those paths need a role
-- with BYPASSRLS and a second connection string. The application has one
-- `DATABASE_URL` today, so that separation is still to be made. Written
-- down here rather than discovered when the first sweep silently
-- processes zero rows.

-- ---------------------------------------------------------------- roles
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'potato_app') THEN
    CREATE ROLE potato_app NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO potato_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO potato_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO potato_app;

-- New tables and sequences from later migrations, without having to
-- remember to re-run the grants.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO potato_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO potato_app;

-- The audit log is append only, for everyone, including us.
REVOKE UPDATE, DELETE ON "AuditLog" FROM potato_app;

-- --------------------------------------------------------------- policy
-- Every request sets app.current_org for the life of the transaction.
-- See src/server/db/client.ts — it is set inside the same transaction as
-- the query, never on a pooled connection that another request could
-- inherit.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT c.table_name
      FROM information_schema.columns c
      JOIN information_schema.tables tb
        ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name
     WHERE c.table_schema = 'public'
       AND c.column_name  = 'orgId'
       AND tb.table_type  = 'BASE TABLE'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    -- FORCE applies the policy to the table owner too. Without it, anyone
    -- connecting as owner silently sees everything.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I;', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I
        USING ("orgId" = current_setting('app.current_org', true))
        WITH CHECK ("orgId" = current_setting('app.current_org', true));
    $f$, t);
  END LOOP;
END $$;

-- Organisation is the one table keyed by id rather than orgId.
ALTER TABLE "Organisation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organisation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Organisation";
CREATE POLICY tenant_isolation ON "Organisation"
  USING (id = current_setting('app.current_org', true));

-- Users are global — an agent moving between agencies keeps one login.
-- Access to a user's data is gated by Membership, which is policed above.
--
-- The NextAuth tables are global for the same reason: sign-in happens
-- before any brokerage is known, so a session cannot be tenant-scoped.

-- ------------------------------------------------------------ soft delete
-- Deleted rows stay readable for the retention window and are removed by
-- a scheduled job, so "delete my data" is answerable with a date rather
-- than a shrug.
CREATE INDEX IF NOT EXISTS lead_deleted_idx    ON "Lead" ("orgId", "deletedAt");
CREATE INDEX IF NOT EXISTS listing_deleted_idx ON "Listing" ("orgId", "deletedAt");

-- ---------------------------------------------------------------
-- A conversation is with exactly one party.
--
-- The constraint that stood here read:
--
--   CHECK (("leadId" IS NULL) <> ("vendorId" IS NULL))
--
-- and it could never have been applied, because **`Conversation` has no
-- `vendorId` column**. `leadId` is still `String @unique` and required.
--
-- That is not a typo in this file, it is a schema change that was
-- designed, written up in CLAUDE.md as done, and never made. Offer,
-- EmailMessage, BlackbookEntry, AgentRequest and FollowUp all carry a
-- `vendorId`; Conversation is the one that was missed — which means the
-- seller side of every deal is still, in CLAUDE.md's own words, half of
-- an agent's talking happening outside the system.
--
-- Reinstating the constraint needs the column, the relation, `leadId`
-- made optional, and the seventeen places that read `conversation.lead`
-- taught to handle its absence. That is a piece of work in its own right
-- and doing it badly, in passing, would be worse than leaving it
-- visible. The constraint returns with the column.
-- ---------------------------------------------------------------

-- ============================================================
-- Scheduling. Sourced from src/server/db/scheduling.sql.
-- ============================================================

-- Double booking, prevented properly.
--
-- The obvious implementation is: query for a clash, and if there isn't
-- one, insert. That is a race. Two agents — or the assistant and an agent
-- — can both read "free" before either writes, and both bookings land.
-- It happens rarely enough in testing to look fine and often enough in
-- production to embarrass somebody in front of a buyer.
--
-- Postgres can enforce it instead. An exclusion constraint refuses any
-- row whose time range overlaps an existing one for the same agent, at
-- the point of insert, under concurrency, with no application logic.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- The range is derived, so it can never disagree with the columns it
-- comes from — which is the usual failure when a start and an end are
-- maintained separately.
ALTER TABLE "Viewing"
  ADD COLUMN IF NOT EXISTS timespan tstzrange
  GENERATED ALWAYS AS (
    tstzrange("scheduledAt",
              "scheduledAt" + ("durationMins" || ' minutes')::interval,
              '[)')
  ) STORED;

-- Only live bookings block a slot. A cancelled or no-show viewing must
-- not keep an agent's diary blocked.
ALTER TABLE "Viewing"
  ADD CONSTRAINT viewing_no_double_booking
  EXCLUDE USING gist (
    "agentId" WITH =,
    timespan  WITH &&
  )
  WHERE (status IN ('SCHEDULED', 'CONFIRMED') AND "agentId" IS NOT NULL);

-- Held-but-unconfirmed slots expire. Without this, an assistant that
-- offers three slots and gets no reply blocks a diary for a week.
CREATE INDEX IF NOT EXISTS viewing_held_idx
  ON "Viewing" ("orgId", "heldUntil")
  WHERE "heldUntil" IS NOT NULL;

-- Reminder sweeps read this constantly.
CREATE INDEX IF NOT EXISTS viewing_reminder_idx
  ON "Viewing" ("scheduledAt")
  WHERE status IN ('SCHEDULED', 'CONFIRMED') AND "remindedLeadAt" IS NULL;
