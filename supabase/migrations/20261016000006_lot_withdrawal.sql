-- Sellers may take a published auction down before its end time, with a reason (D-104). The lot keeps its bids;
-- none wins. place_bid and close_auction only act on 'scheduled' lots, so a withdrawn lot takes no bids and never closes.
alter type lot_status add value if not exists 'withdrawn';
alter table lots add column withdrawal jsonb;
