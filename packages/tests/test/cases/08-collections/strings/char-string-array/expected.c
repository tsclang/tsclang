#include "runtime.h"

int main(void) {
    TSC_INIT();
    String _arr_data_0[] = {STR_LIT("a"), STR_LIT("b"), STR_LIT("c")};
    const Array_string arr = (Array_string){.data = _arr_data_0, .length = 3, .capacity = 3};
    printf("%s\n", arr.data[0].data);
    printf("%zu\n", arr.length);
    return 0;
}
