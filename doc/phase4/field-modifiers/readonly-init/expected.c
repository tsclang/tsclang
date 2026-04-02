#include "runtime.h"

typedef struct { String host; int32_t port; } Config;

static Config Config_new(String host, int32_t port) {
    Config self = {0};
    self.host = host;
    self.port = port;
    return self;
}

int main(void) {
    TSC_INIT();
    const Config c = Config_new(STR_LIT("localhost"), 8080);
    printf("%s\n", c.host.data);
    printf("%d\n", c.port);
    return 0;
}
