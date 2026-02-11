app_name = "vms"
app_title = "Video Management Solution"
app_publisher = "BWH"
app_description = "Built on Frappe"
app_email = "developers@buildwithhussain.com"
app_license = "agpl-3.0"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
# add_to_apps_screen = [
# 	{
# 		"name": "vms",
# 		"logo": "/assets/vms/logo.png",
# 		"title": "Video Management Solution",
# 		"route": "/vms",
# 		"has_permission": "vms.api.permission.has_app_permission"
# 	}
# ]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/vms/css/vms.css"
# app_include_js = "/assets/vms/js/vms.js"

# include js, css files in header of web template
# web_include_css = "/assets/vms/css/vms.css"
# web_include_js = "/assets/vms/js/vms.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "vms/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "vms/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# automatically load and sync documents of this doctype from downstream apps
# importable_doctypes = [doctype_1]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "vms.utils.jinja_methods",
# 	"filters": "vms.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "vms.install.before_install"
after_install = "vms.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "vms.uninstall.before_uninstall"
# after_uninstall = "vms.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "vms.utils.before_app_install"
# after_app_install = "vms.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "vms.utils.before_app_uninstall"
# after_app_uninstall = "vms.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "vms.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

permission_query_conditions = {
	"VMS Project": "vms.permissions.get_project_permission_query_conditions",
	"VMS Asset": "vms.permissions.get_asset_permission_query_conditions",
	"VMS Review Comment": "vms.permissions.get_comment_permission_query_conditions",
	"VMS Audit Log": "vms.permissions.get_audit_log_permission_query_conditions",
}

# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# Document Events
# ---------------
# Hook on document methods and events

doc_events = {
	"VMS Review Comment": {
		"after_insert": "vms.notifications.send_comment_notification",
	},
}

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"vms.tasks.all"
# 	],
# 	"daily": [
# 		"vms.tasks.daily"
# 	],
# 	"hourly": [
# 		"vms.tasks.hourly"
# 	],
# 	"weekly": [
# 		"vms.tasks.weekly"
# 	],
# 	"monthly": [
# 		"vms.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "vms.install.before_tests"

# Extend DocType Class
# ------------------------------
#
# Specify custom mixins to extend the standard doctype controller.
# extend_doctype_class = {
# 	"Task": "vms.custom.task.CustomTaskMixin"
# }

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "vms.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "vms.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["vms.utils.before_request"]
# after_request = ["vms.utils.after_request"]

# Job Events
# ----------
# before_job = ["vms.utils.before_job"]
# after_job = ["vms.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"vms.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []


website_route_rules = [
	{"from_route": "/vms/<path:app_path>", "to_route": "vms"},
]

user_invitation = {
	"allowed_roles": {
		"System Manager": ["Video Manager"],
	},
}
