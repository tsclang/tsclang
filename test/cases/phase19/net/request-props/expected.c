#include "runtime.h"
#include "std/net.h"

static void _handler_0(TscRequest *req, TscResponse *res) {
    const String id = tsc_request_param(req, STR_LIT("id"));
    tsc_string_retain(id);
    tsc_response_text(res, id);
    tsc_string_release(id);
}

int main(void) {
    TSC_INIT();
    TscHttpServer server = tsc_http_server_create(9000);
    tsc_http_server_get(&server, STR_LIT("/:id"), _handler_0);
    return 0;
}