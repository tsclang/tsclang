#include "runtime.h"

typedef struct { String host; int32_t port; } Config;

static Config Config_new(String host, int32_t port) {
    Config self = {0};
    { String _tsc_tmp = host; tsc_string_retain(_tsc_tmp); tsc_string_release(self.host); self.host = _tsc_tmp; }
    self.port = port;
    return self;
}

static void Config_free(Config *self) {
    if (!self) return;
    tsc_string_release(self->host);
}

int main(void) {
    TSC_INIT();
    const Config c = Config_new(STR_LIT("localhost"), 8080);
    printf("%s\n", c.host.data);
    printf("%d\n", c.port);
    Config_free(&c);
    return 0;
}
