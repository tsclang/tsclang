#include "runtime.h"

typedef struct { TscChannel_i32 *_inner; } Channel_i32;

int main(void) {
    TSC_INIT();
    Channel_i32 ch = { ._inner = tsc_channel_create_i32(10) };
    tsc_channel_release_i32(ch._inner);
    return 0;
}
