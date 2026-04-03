#include "runtime.h"

typedef struct { TscChannel_i32 *_inner; } Channel_i32;
typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    Channel_i32 ch = { ._inner = tsc_channel_create_i32(1) };
    const opt_i32 r = tsc_channel_try_receive_i32(ch._inner);
    if (!r.has_value) {
        printf("empty\n");
    }
    tsc_channel_release_i32(ch._inner);
    return 0;
}
