CREATE TABLE tax_rates (
	id INTEGER NOT NULL, 
	name VARCHAR NOT NULL, 
	rate FLOAT NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	PRIMARY KEY (id)
);
CREATE TABLE providers (
	id INTEGER NOT NULL, 
	business_name VARCHAR NOT NULL, 
	legal_name VARCHAR, 
	rfc_tax_id VARCHAR, 
	contact_name VARCHAR, 
	email VARCHAR, 
	phone VARCHAR, 
	credit_days INTEGER NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX ix_providers_business_name ON providers (business_name);
CREATE TABLE clients_v2 (
	id INTEGER NOT NULL, 
	full_name VARCHAR NOT NULL, 
	rfc_tax_id VARCHAR, 
	email VARCHAR NOT NULL, 
	phone VARCHAR NOT NULL, 
	fiscal_address VARCHAR, 
	contact_name VARCHAR, 
	contact_phone VARCHAR, 
	contact_dept VARCHAR, 
	contact2_name VARCHAR, 
	contact2_phone VARCHAR, 
	contact2_dept VARCHAR, 
	contact3_name VARCHAR, 
	contact3_phone VARCHAR, 
	contact3_dept VARCHAR, 
	contact4_name VARCHAR, 
	contact4_phone VARCHAR, 
	contact4_dept VARCHAR, 
	notes VARCHAR, 
	registration_date DATETIME NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX ix_clients_v2_full_name ON clients_v2 (full_name);
CREATE TABLE users (
	email VARCHAR NOT NULL, 
	full_name VARCHAR, 
	is_active BOOLEAN NOT NULL, 
	role VARCHAR(10) NOT NULL, 
	commission_rate FLOAT NOT NULL, 
	id INTEGER NOT NULL, 
	hashed_password VARCHAR NOT NULL, 
	PRIMARY KEY (id)
);
CREATE UNIQUE INDEX ix_users_email ON users (email);
CREATE TABLE materials (
	id INTEGER NOT NULL, 
	sku VARCHAR NOT NULL, 
	name VARCHAR NOT NULL, 
	category VARCHAR NOT NULL, 
	production_route VARCHAR(10) NOT NULL, 
	purchase_unit VARCHAR NOT NULL, 
	usage_unit VARCHAR NOT NULL, 
	conversion_factor FLOAT NOT NULL, 
	current_cost FLOAT NOT NULL, 
	physical_stock FLOAT NOT NULL, 
	committed_stock FLOAT NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	associated_element_sku VARCHAR, 
	provider_id INTEGER, 
	PRIMARY KEY (id), 
	FOREIGN KEY(provider_id) REFERENCES providers (id)
);
CREATE UNIQUE INDEX ix_materials_sku ON materials (sku);
CREATE TABLE global_config (
	id INTEGER NOT NULL, 
	company_name VARCHAR NOT NULL, 
	company_rfc VARCHAR, 
	company_address VARCHAR, 
	company_phone VARCHAR, 
	company_email VARCHAR, 
	company_website VARCHAR, 
	logo_path VARCHAR, 
	target_profit_margin FLOAT NOT NULL, 
	cost_tolerance_percent FLOAT NOT NULL, 
	quote_validity_days INTEGER NOT NULL, 
	default_edgebanding_factor FLOAT NOT NULL, 
	annual_sales_target FLOAT NOT NULL, 
	last_year_sales FLOAT NOT NULL, 
	default_tax_rate_id INTEGER, 
	updated_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(default_tax_rate_id) REFERENCES tax_rates (id)
);
CREATE TABLE design_product_masters (
	id INTEGER NOT NULL, 
	client_id INTEGER, 
	name VARCHAR NOT NULL, 
	category VARCHAR NOT NULL, 
	created_at DATETIME NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	blueprint_path VARCHAR, 
	PRIMARY KEY (id), 
	FOREIGN KEY(client_id) REFERENCES clients_v2 (id)
);
CREATE INDEX ix_design_product_masters_name ON design_product_masters (name);
CREATE TABLE sales_orders (
	id INTEGER NOT NULL, 
	client_id INTEGER NOT NULL, 
	tax_rate_id INTEGER NOT NULL, 
	user_id INTEGER, 
	project_name VARCHAR NOT NULL, 
	status VARCHAR(16) NOT NULL, 
	created_at DATETIME NOT NULL, 
	valid_until DATETIME NOT NULL, 
	delivery_date DATETIME, 
	applied_margin_percent FLOAT NOT NULL, 
	applied_tolerance_percent FLOAT NOT NULL, 
	applied_commission_percent FLOAT NOT NULL, 
	currency VARCHAR NOT NULL, 
	subtotal FLOAT NOT NULL, 
	tax_amount FLOAT NOT NULL, 
	total_price FLOAT NOT NULL, 
	outstanding_balance FLOAT NOT NULL, 
	payment_status VARCHAR(7) NOT NULL, 
	notes VARCHAR, 
	conditions VARCHAR, 
	external_invoice_ref VARCHAR, 
	is_warranty BOOLEAN NOT NULL, commission_amount FLOAT NOT NULL DEFAULT 0, 
	PRIMARY KEY (id), 
	FOREIGN KEY(client_id) REFERENCES clients_v2 (id), 
	FOREIGN KEY(tax_rate_id) REFERENCES tax_rates (id), 
	FOREIGN KEY(user_id) REFERENCES users (id)
);
CREATE TABLE inventory_receptions (
	provider_id INTEGER NOT NULL, 
	invoice_number VARCHAR NOT NULL, 
	invoice_date DATETIME NOT NULL, 
	reception_date DATETIME NOT NULL, 
	total_amount FLOAT NOT NULL, 
	notes VARCHAR, 
	status VARCHAR NOT NULL, 
	id INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(provider_id) REFERENCES providers (id)
);
CREATE INDEX ix_inventory_receptions_invoice_number ON inventory_receptions (invoice_number);
CREATE TABLE purchase_invoices (
	id INTEGER NOT NULL, 
	provider_id INTEGER NOT NULL, 
	invoice_number VARCHAR NOT NULL, 
	uuid_sat VARCHAR, 
	total_amount FLOAT NOT NULL, 
	outstanding_balance FLOAT NOT NULL, 
	issue_date DATE NOT NULL, 
	due_date DATE NOT NULL, 
	status VARCHAR(9) NOT NULL, 
	created_at DATETIME NOT NULL, 
	pdf_url VARCHAR, 
	PRIMARY KEY (id), 
	FOREIGN KEY(provider_id) REFERENCES providers (id)
);
CREATE INDEX ix_purchase_invoices_invoice_number ON purchase_invoices (invoice_number);
CREATE TABLE design_product_versions (
	id INTEGER NOT NULL, 
	master_id INTEGER NOT NULL, 
	version_name VARCHAR NOT NULL, 
	status VARCHAR NOT NULL, 
	estimated_cost FLOAT NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	created_at DATETIME NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(master_id) REFERENCES design_product_masters (id)
);
CREATE TABLE sales_order_items (
	id INTEGER NOT NULL, 
	sales_order_id INTEGER, 
	product_name VARCHAR NOT NULL, 
	origin_version_id INTEGER, 
	quantity FLOAT NOT NULL, 
	unit_price FLOAT NOT NULL, 
	subtotal_price FLOAT NOT NULL, 
	cost_snapshot JSON, 
	frozen_unit_cost FLOAT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(sales_order_id) REFERENCES sales_orders (id)
);
CREATE TABLE customer_payments (
	id INTEGER NOT NULL, 
	sales_order_id INTEGER NOT NULL, 
	amount FLOAT NOT NULL, 
	payment_date DATETIME NOT NULL, 
	payment_method VARCHAR(13) NOT NULL, 
	reference VARCHAR, 
	notes VARCHAR, 
	created_at DATETIME NOT NULL, 
	created_by_user_id INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(sales_order_id) REFERENCES sales_orders (id)
);
CREATE TABLE inventory_transactions (
	reception_id INTEGER, 
	material_id INTEGER NOT NULL, 
	quantity FLOAT NOT NULL, 
	unit_cost FLOAT NOT NULL, 
	subtotal FLOAT NOT NULL, 
	transaction_type VARCHAR NOT NULL, 
	created_at DATETIME NOT NULL, 
	id INTEGER NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(reception_id) REFERENCES inventory_receptions (id), 
	FOREIGN KEY(material_id) REFERENCES materials (id)
);
CREATE TABLE supplier_payments (
	id INTEGER NOT NULL, 
	purchase_invoice_id INTEGER NOT NULL, 
	provider_id INTEGER NOT NULL, 
	amount FLOAT NOT NULL, 
	payment_date DATETIME NOT NULL, 
	payment_method VARCHAR(13) NOT NULL, 
	reference VARCHAR, 
	notes VARCHAR, 
	status VARCHAR(8) NOT NULL, 
	created_at DATETIME NOT NULL, 
	created_by_user_id INTEGER NOT NULL, 
	approved_by_user_id INTEGER, suggested_account_id INTEGER, approved_account_id INTEGER, treasury_transaction_id INTEGER, 
	PRIMARY KEY (id), 
	FOREIGN KEY(purchase_invoice_id) REFERENCES purchase_invoices (id), 
	FOREIGN KEY(provider_id) REFERENCES providers (id)
);
CREATE TABLE design_version_components (
	id INTEGER NOT NULL, 
	version_id INTEGER NOT NULL, 
	material_id INTEGER NOT NULL, 
	quantity FLOAT NOT NULL, 
	PRIMARY KEY (id), 
	FOREIGN KEY(version_id) REFERENCES design_product_versions (id), 
	FOREIGN KEY(material_id) REFERENCES materials (id)
);
CREATE INDEX ix_design_version_components_material_id ON design_version_components (material_id);
CREATE TABLE bank_accounts (
	id INTEGER NOT NULL, 
	name VARCHAR NOT NULL, 
	account_number VARCHAR NOT NULL, 
	currency VARCHAR NOT NULL, 
	initial_balance FLOAT NOT NULL, 
	current_balance FLOAT NOT NULL, 
	is_active BOOLEAN NOT NULL, 
	PRIMARY KEY (id)
);
CREATE INDEX ix_bank_accounts_name ON bank_accounts (name);
CREATE TABLE bank_transactions (
	id INTEGER NOT NULL, 
	account_id INTEGER NOT NULL, 
	transaction_type VARCHAR(8) NOT NULL, 
	amount FLOAT NOT NULL, 
	reference VARCHAR, 
	description VARCHAR, 
	transaction_date DATETIME NOT NULL, 
	related_entity_type VARCHAR, 
	related_entity_id INTEGER, 
	PRIMARY KEY (id), 
	FOREIGN KEY(account_id) REFERENCES bank_accounts (id)
);
