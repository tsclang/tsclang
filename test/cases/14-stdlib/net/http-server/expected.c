#include "runtime.h"
#include "std/net.h"

static void _handler_0(TscRequest *req, TscResponse *res) {
    tsc_response_text(res, STR_LIT("hello"));
}

int main(void) {
    TSC_INIT();
    TscHttpServer server = tsc_http_server_create(8080);
    tsc_http_server_get(&server, STR_LIT("/"), _handler_0);
    return 0;
}
