#include "runtime.h"
#include "std/net.h"

static void _handler_0(TscRequest *req, TscResponse *res) {
    tsc_response_json(res, STR_LIT("{\"ok\":true}"));
}

int main(void) {
    TSC_INIT();
    TscHttpServer server = tsc_http_server_create(3000);
    tsc_http_server_post(&server, STR_LIT("/data"), _handler_0);
    tsc_http_server_listen(&server);
    return 0;
}
