#include "runtime.h"

typedef struct { TscChannel_i32 *_inner; } Channel_i32;
typedef struct { int32_t _arm; int32_t a; int32_t b; } _SelectResult_0;
typedef struct { bool has_value; int32_t value; } opt_i32;

int main(void) {
    TSC_INIT();
    Channel_i32 ch1 = { ._inner = tsc_channel_create_i32(1) };
    Channel_i32 ch2 = { ._inner = tsc_channel_create_i32(1) };
    tsc_channel_send_i32(ch1._inner, 42);
    _SelectResult_0 result = {-1, 0, 0};
    { opt_i32 _sel_a = tsc_channel_try_receive_i32(ch1._inner); if (_sel_a.has_value) { result.a = _sel_a.value; result._arm = 0; } }
    if (result._arm < 0) { opt_i32 _sel_b = tsc_channel_try_receive_i32(ch2._inner); if (_sel_b.has_value) { result.b = _sel_b.value; result._arm = 1; } }
    if (result._arm == 0) {
        printf("%d\n", result.a);
    } else if (result._arm == 1) {
        printf("%d\n", result.b);
    }
    tsc_channel_release_i32(ch2._inner);
    tsc_channel_release_i32(ch1._inner);
    return 0;
}
