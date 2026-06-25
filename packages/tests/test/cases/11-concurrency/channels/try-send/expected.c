#include "runtime.h"

typedef struct { TscChannel_i32 *_inner; } Channel_i32;

int main(void) {
    TSC_INIT();
    Channel_i32 ch = { ._inner = tsc_channel_create_i32(1) };
    tsc_channel_send_i32(ch._inner, 1);
    const bool ok = tsc_channel_try_send_i32(ch._inner, 2);
    printf("%s\n", (ok) ? "true" : "false");
    tsc_channel_release_i32(ch._inner);
    return 0;
}
