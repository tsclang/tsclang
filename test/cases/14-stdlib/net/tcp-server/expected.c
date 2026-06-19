#include "runtime.h"
#include "std/net.h"

static void _handler_0(TscSocket *sock) {
    tsc_socket_close(sock);
}

int main(void) {
    TSC_INIT();
    tsc_net_listen(9090, _handler_0);
    return 0;
}
