#include "runtime.h"

int main(void) {
    TSC_INIT();
    const TscMap_string_i32 m = tsc_map_create_string_i32();
    printf("%zu\n", m.size);
    return 0;
}
